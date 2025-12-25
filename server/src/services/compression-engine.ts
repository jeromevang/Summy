import { loadServerSettings } from './settings-service.js';
import axios from 'axios';

// Duplicate necessary types or import them
export interface CompressionConfig {
    mode: 0 | 1 | 2 | 3;
    keepRecent: number;
    enabled: boolean;
    lastCompressed?: string;
    stats?: {
        originalTokens: number;
        compressedTokens: number;
        ratio: number;
    };
    systemPrompt?: string | null;
}

export interface TextSegment {
    type: 'text';
    messages: any[];
    startIndex: number;
    endIndex: number;
}

export interface ToolSegment {
    type: 'tool';
    messages: any[];
    startIndex: number;
    endIndex: number;
}

export type MessageSegment = TextSegment | ToolSegment;

// Default system prompt for summarization
const DEFAULT_SUMMARY_PROMPT = `You are a context summarizer. Condense the conversation into a brief summary that preserves key information.

Output format:
[CONVERSATION SUMMARY]
Goal: <main objective or topic>
Key Points: <important details, decisions, or facts>
Current State: <where things stand>
[END SUMMARY]

Rules:
- ONLY use information from the conversation
- Be concise (under 150 words)
- Preserve technical terms, names, and specifics exactly
- Output ONLY the summary block, nothing else`;

export class CompressionEngine {
    static isToolRelated(msg: any): boolean {
        if (!msg) return false;
        if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) return true;
        if (msg.role === 'tool') return true;
        if (msg.function_call) return true;
        return false;
    }

    static segmentMessages(messages: any[]): MessageSegment[] {
        const segments: MessageSegment[] = [];
        let currentTextGroup: any[] = [];
        let textStartIndex = 0;

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (this.isToolRelated(msg)) {
                if (currentTextGroup.length > 0) {
                    segments.push({
                        type: 'text',
                        messages: [...currentTextGroup],
                        startIndex: textStartIndex,
                        endIndex: i - 1
                    });
                    currentTextGroup = [];
                }
                const toolMessages: any[] = [msg];
                let endIdx = i;
                if (msg.tool_calls || msg.function_call) {
                    let j = i + 1;
                    while (j < messages.length && messages[j].role === 'tool') {
                        toolMessages.push(messages[j]);
                        endIdx = j;
                        j++;
                    }
                    i = endIdx;
                }
                segments.push({
                    type: 'tool',
                    messages: toolMessages,
                    startIndex: i - (toolMessages.length - 1),
                    endIndex: endIdx
                });
                textStartIndex = i + 1;
            } else {
                if (currentTextGroup.length === 0) textStartIndex = i;
                currentTextGroup.push(msg);
            }
        }
        if (currentTextGroup.length > 0) {
            segments.push({
                type: 'text',
                messages: currentTextGroup,
                startIndex: textStartIndex,
                endIndex: messages.length - 1
            });
        }
        return segments;
    }

    static async callLMStudio(messages: any[], systemPrompt: string): Promise<string> {
        const settings = await loadServerSettings();
        if (!settings.lmstudioUrl) throw new Error('LMStudio URL not configured');
        const url = `${settings.lmstudioUrl}/v1/chat/completions`;
        try {
            const response = await (await import('axios')).default.post(url, {
                model: settings.lmstudioModel || 'local-model',
                messages: [{ role: 'system', content: systemPrompt }, ...messages],
                temperature: 0,
                max_tokens: 1000
            }, { timeout: 60000 });
            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) throw new Error('Empty response from LMStudio');
            return content;
        } catch (error: any) {
            if (error.code === 'ECONNREFUSED') throw new Error('LMStudio is not running or not accessible');
            throw new Error(`LMStudio API error: ${error.message}`);
        }
    }

    static async summarizeTextGroup(messages: any[], customPrompt?: string | null): Promise<string> {
        const content = messages.map(msg => {
            const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
            const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            const truncated = text.length > 500 ? text.substring(0, 500) + '...' : text;
            return `${role}: ${truncated}`;
        }).join('\n');
        const systemPrompt = customPrompt || DEFAULT_SUMMARY_PROMPT;
        const userMessage = { role: 'user', content: `Conversation to summarize:\n\n${content}` };
        return await this.callLMStudio([userMessage], systemPrompt);
    }

    static truncateToolResponse(msg: any, maxLength: number = 500): any {
        if (msg.role !== 'tool') return msg;
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        if (content.length <= maxLength) return msg;
        const lines = content.split('\n');
        const truncated = `[TRUNCATED: ${lines.length} lines, ${content.length} chars]\n${content.substring(0, maxLength)}...\n[END TRUNCATION]`;
        return { ...msg, content: truncated };
    }

    static async convertToolBlockToText(toolMessages: any[]): Promise<string> {
        const toolCall = toolMessages.find(m => m.tool_calls || m.function_call);
        const toolResponses = toolMessages.filter(m => m.role === 'tool');
        let description = '';
        if (toolCall?.tool_calls) {
            for (const tc of toolCall.tool_calls) {
                const funcName = tc.function?.name || 'unknown';
                const args = tc.function?.arguments || '{}';
                description += `Called ${funcName}(${args.substring(0, 100)}${args.length > 100 ? '...' : ''}). `;
            }
        } else if (toolCall?.function_call) {
            const funcName = toolCall.function_call.name || 'unknown';
            description += `Called ${funcName}. `;
        }
        for (const resp of toolResponses) {
            const content = typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);
            const lines = content.split('\n').length;
            description += `Got response (${lines} lines, ${content.length} chars). `;
        }
        return description.trim();
    }

    static async compressMessages(messages: any[], config: CompressionConfig): Promise<{ compressed: any[]; stats: { originalTokens: number; compressedTokens: number; ratio: number } }> {
        if (config.mode === 0 || !config.enabled) {
            const tokenEstimate = JSON.stringify(messages).length / 4;
            return {
                compressed: messages,
                stats: { originalTokens: Math.round(tokenEstimate), compressedTokens: Math.round(tokenEstimate), ratio: 0 }
            };
        }
        const keepRecent = config.keepRecent || 5;
        if (messages.length <= keepRecent) {
            const tokenEstimate = JSON.stringify(messages).length / 4;
            return {
                compressed: messages,
                stats: { originalTokens: Math.round(tokenEstimate), compressedTokens: Math.round(tokenEstimate), ratio: 0 }
            };
        }
        const recentMessages = messages.slice(-keepRecent);
        const oldMessages = messages.slice(0, -keepRecent);
        const originalTokens = Math.round(JSON.stringify(messages).length / 4);
        const segments = this.segmentMessages(oldMessages);
        const compressedSegments: any[] = [];
        for (const segment of segments) {
            if (segment.type === 'text') {
                try {
                    const summary = await this.summarizeTextGroup(segment.messages, config.systemPrompt);
                    compressedSegments.push({ role: 'system', content: `[CONVERSATION SUMMARY]\n${summary}\n[END SUMMARY]` });
                } catch (error: any) {
                    throw new Error(`Compression failed: ${error.message}`);
                }
            } else if (segment.type === 'tool') {
                switch (config.mode) {
                    case 1: compressedSegments.push(...segment.messages); break;
                    case 2:
                        for (const msg of segment.messages) {
                            if (msg.role === 'tool') compressedSegments.push(this.truncateToolResponse(msg));
                            else compressedSegments.push(msg);
                        }
                        break;
                    case 3:
                        try {
                            const toolSummary = await this.convertToolBlockToText(segment.messages);
                            compressedSegments.push({ role: 'system', content: `[TOOL SUMMARY] ${toolSummary} [END TOOL SUMMARY]` });
                        } catch {
                            compressedSegments.push(...segment.messages);
                        }
                        break;
                }
            }
        }
        const compressed = [...compressedSegments, ...recentMessages];
        const compressedTokens = Math.round(JSON.stringify(compressed).length / 4);
        const ratio = originalTokens > 0 ? (originalTokens - compressedTokens) / originalTokens : 0;
        return {
            compressed,
            stats: { originalTokens, compressedTokens, ratio: Math.round(ratio * 100) / 100 }
        };
    }
}
