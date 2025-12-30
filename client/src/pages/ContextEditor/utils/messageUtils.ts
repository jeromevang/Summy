import { ConversationTurn, ToolCallInfo } from '../types';

export const parseToolCalls = (msg: any): ToolCallInfo[] => {
  if (!msg.tool_calls || !Array.isArray(msg.tool_calls)) return [];
  
  return msg.tool_calls.map((tc: any) => ({
    id: tc.id || 'unknown',
    name: tc.function?.name || tc.name || 'unknown_tool',
    arguments: typeof tc.function?.arguments === 'string' 
      ? (() => { try { return JSON.parse(tc.function.arguments); } catch { return { raw: tc.function.arguments }; } })()
      : tc.function?.arguments || tc.arguments || {}
  }));
};

export const getUserMessage = (turn: ConversationTurn): string => {
  const userMessages = turn.request?.messages?.filter(m => m.role === 'user') || [];
  return userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';
};

export const getAssistantMessage = (turn: ConversationTurn): string => {
  if (turn.response?.type === 'streaming') {
    return turn.response.content || '';
  }
  return turn.response?.choices?.[0]?.message?.content || '';
};
