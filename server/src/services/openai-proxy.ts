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
            // Only add MCP tools if user explicitly requested tools or if we detect tool-intent
            const userRequestedTools = req.body?.tools && req.body.tools.length > 0;
            if (userRequestedTools && mcpToolsToAdd.length > 0) {
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

                        // Set up streaming headers for dual-model
                        if (req.isStreaming) {
                            res.setHeader('Content-Type', 'text/event-stream');
                            res.setHeader('Cache-Control', 'no-cache');
                            res.setHeader('Connection', 'keep-alive');
                            res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
                            res.flushHeaders();
                        }

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

                        // Check if there are tool calls that need execution
                        const toolCallsToExecute = routingResult.toolCalls ||
                            routingResult.finalResponse?.choices?.[0]?.message?.tool_calls;

                        // In dual-model mode, ALWAYS execute tools locally since we're managing the agentic flow
                        if (toolCallsToExecute && toolCallsToExecute.length > 0) {
                            const toolNames = toolCallsToExecute.map((tc: any) => tc.function?.name || tc.name).join(', ');
                            addDebugEntry('request', `Dual-model: executing ${toolCallsToExecute.length} tool calls via agentic loop: ${toolNames}`, {});

                            // Stream detailed thinking to IDE as content
                            if (req.isStreaming && routingResult.phases?.[0]?.reasoning) {
                                const reasoning = routingResult.phases[0].reasoning;
                                const thinkingPrefix = `🤔 Main model reasoning: ${reasoning}\n\n`;
                                const thinkingWords = thinkingPrefix.match(/\S+\s*|\n+/g) || [thinkingPrefix];

                                // Stream thinking as initial content
                                for (const word of thinkingWords) {
                                    res.write(`data: ${JSON.stringify({
                                        choices: [{ delta: { content: word }, index: 0 }]
                                    })}\n\n`);
                                }

                                // Stream intent if available
                                if (routingResult.intent) {
                                    const intent = routingResult.intent;
                                    const intentText = `🎯 Intent detected: ${intent.action}${intent.tool ? ` → ${intent.tool}` : ''}\n\n`;
                                    const intentWords = intentText.match(/\S+\s*|\n+/g) || [intentText];

                                    for (const word of intentWords) {
                                        res.write(`data: ${JSON.stringify({
                                            choices: [{ delta: { content: word }, index: 0 }]
                                        })}\n\n`);
                                    }
                                }
                            }


                            // Set up LLM call function for follow-up calls
                            const llmCallFn = async (msgs: any[]) => {
                                const response = await axios.post(`${settings.lmstudioUrl}/v1/chat/completions`, {
                                    model: settings.executorModelId || settings.lmstudioModel,
                                    messages: msgs,
                                    tools: toolsToSend,
                                    temperature: 0,
                                    stream: false
                                });
                                return response.data;
                            };

                            // Create streaming wrapper that adds detailed feedback
                            const streamingRes = req.isStreaming ? {
                                write: (chunk: string) => {
                                    // Parse the chunk to add context
                                    if (chunk.includes('"content":')) {
                                        try {
                                            const event = JSON.parse(chunk.replace('data: ', ''));
                                            if (event.choices?.[0]?.delta?.content) {
                                                const content = event.choices[0].delta.content;
                                                // Add tool execution context
                                                if (content.includes('Reading file') || content.includes('Searching')) {
                                                    // These are already tool messages, pass through
                                                    res.write(chunk);
                                                } else {
                                                    // Add analysis context for other content
                                                    res.write(chunk);
                                                }
                                            } else {
                                                res.write(chunk);
                                            }
                                        } catch (e) {
                                            res.write(chunk);
                                        }
                                    } else {
                                        res.write(chunk);
                                    }
                                }
                            } : undefined;

                            // Create streaming LLM function for analysis phases
                            const streamingLlmCallFn = async (msgs: any[]) => {
                                const streamResponse = await axios.post(`${settings.lmstudioUrl}/v1/chat/completions`, {
                                    model: settings.executorModelId || settings.lmstudioModel,
                                    messages: msgs,
                                    tools: [], // No tools for analysis
                                    temperature: 0,
                                    stream: true
                                }, {
                                    responseType: 'stream'
                                });

                                return new Promise((resolve, reject) => {
                                    let fullContent = '';
                                    let streamEnded = false;

                                    const timeout = setTimeout(() => {
                                        if (!streamEnded) {
                                            const parsedResponse = parseStreamingResponse(fullContent);
                                            resolve(parsedResponse);
                                        }
                                    }, 10000); // 10 second timeout

                                    streamResponse.data.on('data', (chunk: Buffer) => {
                                        const chunkStr = chunk.toString();
                                        fullContent += chunkStr;

                                        // Stream analysis reasoning to IDE in real-time
                                        if (streamingRes && chunkStr.includes('data: ')) {
                                            const lines = chunkStr.split('\n');
                                            for (const line of lines) {
                                                if (line.startsWith('data: ')) {
                                                    const dataStr = line.slice(6);
                                                    if (dataStr === '[DONE]') {
                                                        streamEnded = true;
                                                        clearTimeout(timeout);
                                                        const parsedResponse = parseStreamingResponse(fullContent);
                                                        resolve(parsedResponse);
                                                        return;
                                                    }

                                                    try {
                                                        const event = JSON.parse(dataStr);
                                                        if (event.choices?.[0]?.delta?.content) {
                                                            const content = event.choices[0].delta.content;
                                                            // Stream analysis content directly to IDE
                                                            streamingRes.write(`data: ${JSON.stringify({
                                                                choices: [{ delta: { content: content }, index: 0 }]
                                                            })}\n\n`);
                                                        }
                                                    } catch (e) {
                                                        // Skip parse errors
                                                    }
                                                }
                                            }
                                        }
                                    });

                                    streamResponse.data.on('end', () => {
                                        streamEnded = true;
                                        clearTimeout(timeout);
                                        const parsedResponse = parseStreamingResponse(fullContent);
                                        resolve(parsedResponse);
                                    });

                                    streamResponse.data.on('error', (err) => {
                                        clearTimeout(timeout);
                                        reject(err);
                                    });
                                });
                            };

                            // Execute tools via agentic loop (headers already set above)
                            const executorModel = settings.executorModelId || settings.lmstudioModel || 'unknown';
                            const { finalResponse, agenticMessages } = await executeAgenticLoop(
                                routingResult.finalResponse,
                                messagesToSend,
                                llmCallFn,
                                ideMappingConfig,
                                req.sessionId,
                                10,
                                streamingRes,
                                executorModel,
                                streamingLlmCallFn
                            );

                            await SessionService.updateSessionWithResponse(req.sessionId, req.requestBody, finalResponse, agenticMessages);

                            if (req.isStreaming) {
                                // Stream the final response content word by word for natural feel
                                const finalContent = finalResponse?.choices?.[0]?.message?.content || '';
                                if (finalContent) {
                                    // Split by words/punctuation for natural streaming
                                    const words = finalContent.match(/\S+\s*|\n+/g) || [finalContent];
                                    for (const word of words) {
                                        res.write(`data: ${JSON.stringify({
                                            choices: [{ delta: { content: word }, index: 0 }]
                                        })}\n\n`);
                                    }
                                }
                                res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
                                res.write('data: [DONE]\n\n');
                                res.end();
                            } else {
                                console.log(`[STREAMING] Dual-model returning JSON response at ${new Date().toISOString()}`);
                                res.json(finalResponse);
                            }
                            return;
                        }

                        // No tool calls or tools shouldn't be executed - return response directly
                        await SessionService.updateSessionWithResponse(req.sessionId, req.requestBody, routingResult.finalResponse);

                        if (req.isStreaming) {
                            // Headers already set above, stream the content word by word
                            const content = routingResult.finalResponse?.choices?.[0]?.message?.content || '';

                            if (content) {
                                const words = content.match(/\S+\s*|\n+/g) || [content];
                                for (const word of words) {
                                    res.write(`data: ${JSON.stringify({ 
                                        choices: [{ delta: { content: word }, index: 0 }] 
                                    })}\n\n`);
                                }
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
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
                    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
                    res.flushHeaders();

                    let fullContent = '';
                    let streamingToIDE = false; // Track if we've started streaming to IDE

                    response.data.on('data', (chunk: Buffer) => {
                        const chunkStr = chunk.toString();
                        fullContent += chunkStr;

                        // Try to determine if this needs agentic processing
                        let needsAgentic = false;
                        try {
                            const partialResponse = parseStreamingResponse(fullContent);
                            needsAgentic = shouldExecuteAgentically(partialResponse, ideMappingConfig, mcpToolsToAdd);
                        } catch (e) {
                            // If parsing fails, assume no agentic processing needed yet
                            needsAgentic = false;
                        }

                        if (needsAgentic) {
                            // Need agentic processing - accumulate and don't stream yet
                            return;
                        } else {
                            // No agentic processing needed - pass through streaming directly
                            if (!streamingToIDE) {
                                streamingToIDE = true;
                            }
                            res.write(chunkStr);
                        }
                    });

                    response.data.on('end', async () => {
                        const parsedResponse = parseStreamingResponse(fullContent);
                        const needsAgentic = shouldExecuteAgentically(parsedResponse, ideMappingConfig, mcpToolsToAdd);

                        if (needsAgentic) {
                            // Now we need agentic processing - stop the direct streaming and do agentic loop
                            const llmCallFn = async (msgs: any[]) => {
                                const r = await axios.post(lmstudioUrl, { ...modifiedBody, messages: msgs, stream: false });
                                return r.data;
                            };
                            const { finalResponse, agenticMessages } = await executeAgenticLoop(
                                parsedResponse, messagesToSend, llmCallFn, ideMappingConfig, req.sessionId, 10, res, settings.lmstudioModel || 'unknown'
                            );
                            await SessionService.updateSessionWithResponse(req.sessionId, req.requestBody, finalResponse, agenticMessages);

                            // Stream the final response content word by word
                            const finalContent = finalResponse?.choices?.[0]?.message?.content || '';
                            if (finalContent) {
                                const words = finalContent.match(/\S+\s*|\n+/g) || [finalContent];
                                for (const word of words) {
                                    res.write(`data: ${JSON.stringify({
                                        choices: [{ delta: { content: word }, index: 0 }]
                                    })}\n\n`);
                                }
                            }
                            res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
                            res.write('data: [DONE]\n\n');
                            res.end();
                        } else {
                            // Already streamed directly - just save session and close
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
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
                res.flushHeaders();

                let fullContent = '';
                response.data.on('data', (chunk: Buffer) => {
                    const chunkStr = chunk.toString();
                    fullContent += chunkStr;
                });
                response.data.on('end', async () => {
                    const parsedResponse = parseStreamingResponse(fullContent);
                    if (shouldExecuteAgentically(parsedResponse, ideMappingConfig, mcpToolsToAdd)) {
                        const llmCallFn = async (msgs: any[]) => {
                            const r = await axios({ method: 'POST', url, headers, data: { ...modifiedBody, messages: msgs, stream: false } });
                            return r.data;
                        };
                        const { finalResponse, agenticMessages } = await executeAgenticLoop(parsedResponse, messagesToSend, llmCallFn, ideMappingConfig, req.sessionId, 10, res, actualModelId);
                        await SessionService.updateSessionWithResponse(req.sessionId, req.requestBody, finalResponse, agenticMessages);

                        // Stream the final response content word by word
                        const finalContent = finalResponse?.choices?.[0]?.message?.content || '';
                        if (finalContent) {
                            const words = finalContent.match(/\S+\s*|\n+/g) || [finalContent];
                            for (const word of words) {
                                res.write(`data: ${JSON.stringify({
                                    choices: [{ delta: { content: word }, index: 0 }]
                                })}\n\n`);
                            }
                        }
                        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
                        res.write('data: [DONE]\n\n');
                        res.end();
                    } else {
                        // For regular (non-agentic) responses, stream the content properly
                        await SessionService.updateSessionWithResponse(req.sessionId, req.requestBody, parsedResponse);

                        const content = parsedResponse?.choices?.[0]?.message?.content || '';
                        console.log(`[STREAMING] Starting Azure/OpenAI streaming of ${content.length} chars at ${new Date().toISOString()}`);
                        if (content) {
                            // Stream content word by word like the agentic loop does
                            const words = content.match(/\S+\s*|\n+/g) || [content];
                            console.log(`[STREAMING] Split into ${words.length} tokens for streaming`);
                            let tokenCount = 0;
                            for (const word of words) {
                                tokenCount++;
                                const timestamp = new Date().toISOString();
                                console.log(`[STREAMING] IDE TOKEN ${tokenCount}/${words.length}: "${word.replace(/\n/g, '\\n')}" at ${timestamp}`);
                                res.write(`data: ${JSON.stringify({
                                    choices: [{ delta: { content: word }, index: 0 }]
                                })}\n\n`);
                            }
                            console.log(`[STREAMING] Completed streaming ${tokenCount} tokens to IDE at ${new Date().toISOString()}`);
                        }

                        // Send completion
                        console.log(`[STREAMING] Sending completion to IDE at ${new Date().toISOString()}`);
                        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
                        res.write('data: [DONE]\n\n');
                        res.end();
                        console.log(`[STREAMING] Azure/OpenAI streaming fully ended at ${new Date().toISOString()}`);
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
