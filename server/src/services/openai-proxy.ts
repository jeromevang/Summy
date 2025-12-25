import axios from 'axios';
import fs from 'fs';
import { ideMapping } from './ide-mapping.js';
import { capabilities, ALL_TOOLS } from '../modules/tooly/capabilities.js';
import { TOOL_SCHEMAS } from '../modules/tooly/tool-prompts.js';
import { addDebugEntry } from './logger.js';
import { broadcastToClients } from './broadcast-util.js';
import { loadServerSettings } from './settings-service.js';
import { SessionService } from './session-service.js';
import { CompressionEngine } from './compression-engine.js';
import { executeAgenticLoop, parseStreamingResponse, shouldExecuteAgentically } from '../modules/tooly/cognitive-engine.js';
import { intentRouter } from '../modules/tooly/intent-router.js';

export class OpenAIProxy {
    static normalizeMessages(messages: any[]): any[] {
        if (!messages || messages.length === 0) return [];

        const result: any[] = [];
        for (const msg of messages) {
            let content = msg.content;

            // Flatten array content (Cursor/multi-modal format)
            if (Array.isArray(content)) {
                content = content
                    .map((c: any) => typeof c === 'string' ? c : (c.text || JSON.stringify(c)))
                    .join('\n');
            }

            // Ensure content is at least an empty string and sanitize for Jinja
            // This prevents LM Studio from trying to render {{ ... }} or {% ... %} blocks in user code
            // We are being aggressive here and replacing all potential Jinja trigger characters with spaces
            content = (content || '').replace(/[\{\}\%\#]/g, ' ');

            if (result.length > 0 && result[result.length - 1].role === msg.role && msg.role !== 'assistant') {
                // Merge consecutive messages and sanitize joins
                result[result.length - 1].content += '\n\n' + content;
            } else {
                result.push({ ...msg, role: msg.role, content });
            }
        }

        // Ensure there is at least a system message at the start
        if (result.length > 0 && result[0].role !== 'system') {
            result.unshift({ role: 'system', content: 'You are a helpful AI assistant.' });
        }

        return result;
    }

    static async proxyToOpenAI(req: any, res: any) {
        try {
            req.requestBody = req.body;
            req.sessionId = SessionService.extractConversationId(req);
            req.isStreaming = req.body?.stream === true;

            await SessionService.createSessionFromRequest(req);

            broadcastToClients('turn_status', {
                sessionId: req.sessionId,
                status: 'thinking',
                message: 'Waiting for response...'
            });

            const apiKey = process.env.OPENAI_API_KEY;
            let messagesToSend = OpenAIProxy.normalizeMessages(req.body?.messages || []);
            const session = await SessionService.loadSession(req.sessionId);

            // Load settings and model profile first (needed for auto-compression)
            const settings = await loadServerSettings();
            const requestedModel = req.body?.model || 'gpt-4o-mini';
            const parsedModel = ideMapping.parseModelIDE(requestedModel);
            const ideMappingConfig = await ideMapping.loadIDEMapping(parsedModel.ide);

            const actualModelId = settings.provider === 'lmstudio'
                ? settings.lmstudioModel
                : settings.provider === 'azure'
                    ? settings.azureDeploymentName
                    : settings.openaiModel || parsedModel.baseModel;

            const modelProfile = actualModelId ? await capabilities.getProfile(actualModelId) : null;
            
            // Estimate current token count (rough: chars / 4)
            const estimatedTokens = Math.round(JSON.stringify(messagesToSend).length / 4);
            const modelContextLength = modelProfile?.contextLength || 16000;
            const contextThreshold = 0.75; // Compress when at 75% of context
            const shouldAutoCompress = estimatedTokens > modelContextLength * contextThreshold;
            
            // Auto-compress if approaching context limit (even if compression not manually enabled)
            if (shouldAutoCompress && !session?.compression?.enabled) {
                addDebugEntry('request', `Auto-compression triggered: ${estimatedTokens} tokens > ${Math.round(modelContextLength * contextThreshold)} threshold`, {});
                const autoConfig = {
                    mode: 2 as const, // Truncate tool responses
                    keepRecent: 10,
                    enabled: true
                };
                try {
                    const compressionResult = await CompressionEngine.compressMessages(messagesToSend, autoConfig);
                    messagesToSend = compressionResult.compressed;
                    addDebugEntry('request', `Auto-compression complete`, { stats: compressionResult.stats });
                } catch (err: any) {
                    addDebugEntry('error', `Auto-compression failed: ${err.message}`, {});
                }
            }
            // Manual compression (if enabled in session)
            else if (session?.compression?.enabled && session.compression.mode > 0) {
                try {
                    const compressionResult = await CompressionEngine.compressMessages(messagesToSend, session.compression);
                    messagesToSend = compressionResult.compressed;
                    addDebugEntry('request', `Compression complete`, { stats: compressionResult.stats });
                } catch (err: any) {
                    addDebugEntry('error', `Compression failed: ${err.message}`, {});
                }
            }
            const modelEnabledTools = modelProfile?.enabledTools?.length ? modelProfile.enabledTools : ALL_TOOLS;
            const mcpToolsToAdd = ideMapping.getMCPToolsToAdd(modelEnabledTools, ideMappingConfig);

            let toolsToSend = req.body?.tools || [];
            // Simplified tool logic for proxying
            if (mcpToolsToAdd.length > 0) {
                const existingToolNames = new Set(toolsToSend.map((t: any) => t.function?.name).filter(Boolean));
                for (const mcpTool of mcpToolsToAdd) {
                    if (!existingToolNames.has(mcpTool) && TOOL_SCHEMAS[mcpTool]) {
                        toolsToSend.push(TOOL_SCHEMAS[mcpTool]);
                    }
                }
            }

            // Aggressive tool sanitization and standardization
            toolsToSend = toolsToSend.map((tool: any) => {
                if (tool.function) {
                    // 1. Clean tool name (alphanumeric + underscore only)
                    tool.function.name = tool.function.name.replace(/[^a-zA-Z0-9_]/g, '_');

                    // 2. Aggressively sanitize all descriptions for Jinja
                    const sanitizeStr = (s: string) => (s || '').replace(/[\{\}\%\#]/g, ' ');

                    if (tool.function.description) {
                        tool.function.description = sanitizeStr(tool.function.description);
                    }

                    if (tool.function.parameters?.properties) {
                        // 3. Remove non-standard fields like additionalProperties
                        if (tool.function.parameters.additionalProperties !== undefined) {
                            delete tool.function.parameters.additionalProperties;
                        }

                        for (const prop in tool.function.parameters.properties) {
                            const p = tool.function.parameters.properties[prop];
                            if (p.description) {
                                p.description = sanitizeStr(p.description);
                            }
                            // Clean up sub-properties if any
                            if (p.additionalProperties !== undefined) delete p.additionalProperties;
                            if (p.items?.additionalProperties !== undefined) delete p.items.additionalProperties;
                        }
                    }
                }
                return tool;
            }).slice(0, 20); // Limit to 20 tools for now

            const effectiveProvider = settings.provider;

            if (effectiveProvider === 'lmstudio') {
                const lmstudioUrl = `${settings.lmstudioUrl}/v1/chat/completions`;

                // ============================================================
                // DUAL-MODEL ROUTING (when enabled)
                // Main model: reasoning/planning (no tools)
                // Executor model: tool execution (with tools)
                // ============================================================
                const isDualModelEnabled = settings.enableDualModel && 
                    settings.mainModelId && 
                    settings.executorModelId &&
                    toolsToSend.length > 0; // Only use dual-model when tools are involved

                if (isDualModelEnabled) {
                    addDebugEntry('request', `Dual-model routing: main=${settings.mainModelId}, executor=${settings.executorModelId}`, {
                        messageCount: messagesToSend.length,
                        toolCount: toolsToSend.length
                    });

                    try {
                        // Configure the intent router
                        await intentRouter.configure({
                            mainModelId: settings.mainModelId,
                            executorModelId: settings.executorModelId,
                            enableDualModel: true,
                            timeout: 120000,
                            provider: 'lmstudio',
                            settings: {
                                lmstudioUrl: settings.lmstudioUrl
                            }
                        });

                        // Route through dual-model pipeline
                        const routingResult = await intentRouter.route(messagesToSend, toolsToSend);

                        addDebugEntry('request', `Dual-model routing complete`, {
                            mode: routingResult.mode,
                            hasToolCalls: !!routingResult.toolCalls?.length,
                            latency: routingResult.latency,
                            intent: routingResult.intent
                        });

                        // Log for debugging
                        try {
                            fs.writeFileSync('last-dual-model-result.json', JSON.stringify(routingResult, null, 2));
                        } catch (e) {
                            console.error('Failed to log dual-model result:', e);
                        }

                        // Update session and return the response
                        await SessionService.updateSessionWithResponse(req.sessionId, req.requestBody, routingResult.finalResponse);

                        // For streaming, we need to format as SSE
                        if (req.isStreaming) {
                            res.setHeader('Content-Type', 'text/event-stream');
                            const content = routingResult.finalResponse?.choices?.[0]?.message?.content || '';
                            const toolCalls = routingResult.finalResponse?.choices?.[0]?.message?.tool_calls;

                            // Stream the content
                            if (content) {
                                res.write(`data: ${JSON.stringify({ 
                                    choices: [{ delta: { content }, index: 0 }] 
                                })}\n\n`);
                            }

                            // Stream tool calls if present
                            if (toolCalls && toolCalls.length > 0) {
                                res.write(`data: ${JSON.stringify({ 
                                    choices: [{ 
                                        delta: { tool_calls: toolCalls },
                                        index: 0 
                                    }] 
                                })}\n\n`);
                            }

                            res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
                            res.write('data: [DONE]\n\n');
                            res.end();
                        } else {
                            res.json(routingResult.finalResponse);
                        }
                        return;
                    } catch (err: any) {
                        addDebugEntry('error', `Dual-model routing failed, falling back to single model: ${err.message}`, {});
                        console.error('[Dual-Model] Routing failed:', err.message);
                        // Fall through to single-model mode
                    }
                }

                // ============================================================
                // SINGLE-MODEL MODE (default or fallback)
                // ============================================================

                // Remove 'user' field if it contains '|' as it might trigger Jinja errors in some templates
                const cleanBody = { ...req.body };
                if (typeof cleanBody.user === 'string' && cleanBody.user.includes('|')) {
                    delete cleanBody.user;
                }

                const modifiedBody = {
                    ...cleanBody,
                    model: settings.lmstudioModel as string,
                    messages: messagesToSend,
                    tools: toolsToSend.length > 0 ? toolsToSend : undefined,
                    temperature: 0,
                    tool_choice: undefined,
                    stream_options: undefined,
                    parallel_tool_calls: false // Force false to avoid potential template bugs
                };

                // Log the final payload for deep inspection
                try {
                    fs.writeFileSync('last-lmstudio-payload.json', JSON.stringify(modifiedBody, null, 2));
                } catch (e) {
                    console.error('Failed to log payload:', e);
                }

                addDebugEntry('request', `Proxying to LM Studio: ${settings.lmstudioModel}`, {
                    messageCount: messagesToSend.length,
                    toolCount: toolsToSend.length,
                    hasTools: toolsToSend.length > 0,
                    parallel: false
                });

                if (toolsToSend.length > 0) {
                    addDebugEntry('request', 'Tools sent to LM Studio', {
                        tools: toolsToSend.map((t: any) => t.function?.name)
                    });
                }

                const response = await axios({
                    method: 'POST',
                    url: lmstudioUrl,
                    headers: { 'Content-Type': 'application/json' },
                    data: modifiedBody,
                    timeout: 300000,
                    responseType: req.isStreaming ? 'stream' : 'json',
                });

                if (req.isStreaming) {
                    res.setHeader('Content-Type', 'text/event-stream');
                    let fullContent = '';
                    response.data.on('data', (chunk: Buffer) => {
                        const chunkStr = chunk.toString();
                        fullContent += chunkStr;
                        res.write(chunkStr);
                    });
                    response.data.on('end', async () => {
                        const parsedResponse = parseStreamingResponse(fullContent);
                        if (shouldExecuteAgentically(parsedResponse, ideMappingConfig, mcpToolsToAdd)) {
                            const llmCallFn = async (msgs: any[]) => {
                                const r = await axios.post(lmstudioUrl, { ...modifiedBody, messages: msgs, stream: false });
                                return r.data;
                            };
                            const { finalResponse, agenticMessages } = await executeAgenticLoop(
                                parsedResponse, messagesToSend, llmCallFn, ideMappingConfig, req.sessionId, 10, res
                            );
                            await SessionService.updateSessionWithResponse(req.sessionId, req.requestBody, finalResponse, agenticMessages);
                            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "" }, finish_reason: 'stop' }] })}\n\n`);
                            res.write('data: [DONE]\n\n');
                            res.end();
                        } else {
                            await SessionService.updateSessionWithResponse(req.sessionId, req.requestBody, parsedResponse);
                            res.end();
                        }
                    });
                } else {
                    await SessionService.updateSessionWithResponse(req.sessionId, req.requestBody, response.data);
                    res.json(response.data);
                }
                return;
            }

            // OpenAI and Azure
            if (settings.provider !== 'lmstudio' && (!apiKey || apiKey === 'your_openai_api_key_here')) {
                return res.status(500).json({ error: 'Configuration Error', message: 'OpenAI API key not configured' });
            }

            let url = 'https://api.openai.com/v1/chat/completions';
            const headers: any = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            };

            if (effectiveProvider === 'azure') {
                url = `https://${settings.azureResourceName}.openai.azure.com/openai/deployments/${settings.azureDeploymentName}/chat/completions?api-version=${settings.azureApiVersion}`;
                delete headers['Authorization'];
                headers['api-key'] = settings.azureApiKey;
            }

            const modifiedBody = {
                ...req.body,
                model: actualModelId,
                messages: messagesToSend,
                tools: toolsToSend.length > 0 ? toolsToSend : undefined
            };

            const response = await axios({
                method: 'POST',
                url,
                headers,
                data: modifiedBody,
                responseType: req.isStreaming ? 'stream' : 'json',
                timeout: 300000
            });

            if (req.isStreaming) {
                res.setHeader('Content-Type', 'text/event-stream');
                let fullContent = '';
                response.data.on('data', (chunk: Buffer) => {
                    const chunkStr = chunk.toString();
                    fullContent += chunkStr;
                    res.write(chunkStr);
                });
                response.data.on('end', async () => {
                    const parsedResponse = parseStreamingResponse(fullContent);
                    if (shouldExecuteAgentically(parsedResponse, ideMappingConfig, mcpToolsToAdd)) {
                        const llmCallFn = async (msgs: any[]) => {
                            const r = await axios({ method: 'POST', url, headers, data: { ...modifiedBody, messages: msgs, stream: false } });
                            return r.data;
                        };
                        const { finalResponse, agenticMessages } = await executeAgenticLoop(parsedResponse, messagesToSend, llmCallFn, ideMappingConfig, req.sessionId, 10, res);
                        await SessionService.updateSessionWithResponse(req.sessionId, req.requestBody, finalResponse, agenticMessages);
                        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "" }, finish_reason: 'stop' }] })}\n\n`);
                        res.write('data: [DONE]\n\n');
                        res.end();
                    } else {
                        await SessionService.updateSessionWithResponse(req.sessionId, req.requestBody, parsedResponse);
                        res.end();
                    }
                });
            } else {
                await SessionService.updateSessionWithResponse(req.sessionId, req.requestBody, response.data);
                res.json(response.data);
            }
        } catch (error: any) {
            console.error('[PROXY ERROR]', error.response?.data || error.message);
            const status = error.response?.status || 500;
            const errorData = error.response?.data || { error: { message: error.message } };
            res.status(status).json(errorData);
        }
    }
}
