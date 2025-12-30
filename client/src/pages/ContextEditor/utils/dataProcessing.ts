import { ContextSession, ConversationTurn, ToolResultInfo } from '../types';
import { getUserMessage, getAssistantMessage, parseToolCalls } from './messageUtils';

export const getEffectiveTurnIndex = (session: ContextSession | null, selectedTurn: number): number => {
  if (!session?.conversations.length) return 0;
  return selectedTurn === 0 ? session.conversations.length : selectedTurn;
};

export const getRawSourceMessages = (session: ContextSession | null, selectedTurn: number): any[] => {
  if (!session?.conversations.length) return [];
  
  const turnIdx = getEffectiveTurnIndex(session, selectedTurn);
  const turn = session.conversations[turnIdx - 1];
  if (!turn) return [];
  
  const messages: any[] = [];
  
  if (turn.request?.messages) {
    for (const msg of turn.request.messages) {
      let source = '→ to LLM';
      if (msg.role === 'tool') source = '→ tool result to LLM';
      else if (msg.role === 'system') source = '→ system to LLM';
      else if (msg.role === 'user') source = '→ user to LLM';
      else if (msg.role === 'assistant' && msg.tool_calls) source = '→ context to LLM';
      
      messages.push({
        ...msg,
        _source: source,
        _turnId: turn.id,
        _turnNumber: turnIdx,
        _timestamp: turn.timestamp
      });
    }
  }
  
  const toolyMeta = (turn.response as any)?.toolyMeta || turn.toolyMeta;
  const isAgentic = toolyMeta?.agenticLoop && toolyMeta?.toolExecutions?.length > 0;
  
  if (turn.response) {
    const responseMsg = turn.response.choices?.[0]?.message;
    const responseContent = responseMsg?.content || turn.response.content || '';
    
    if (isAgentic) {
      messages.push({
        role: 'assistant_agentic',
        content: responseContent,
        _source: '← from LLM (agentic)',
        _turnId: turn.id,
        _turnNumber: turnIdx,
        _timestamp: turn.timestamp,
        _agenticData: {
          iterations: toolyMeta.iterations || 1,
          toolExecutions: toolyMeta.toolExecutions,
          initialIntent: toolyMeta.initialIntent
        }
      });
    } else if (responseMsg) {
      messages.push({
        ...responseMsg,
        _source: '← from LLM',
        _turnId: turn.id,
        _turnNumber: turnIdx,
        _timestamp: turn.timestamp
      });
    } else if (turn.response.content) {
      messages.push({
        role: 'assistant',
        content: turn.response.content,
        _source: '← from LLM',
        _turnId: turn.id,
        _turnNumber: turnIdx,
        _timestamp: turn.timestamp
      });
    }
  }
  
  return messages;
};

export const getAllMessages = (session: ContextSession | null, upToTurn?: number): any[] => {
  if (!session) return [];
  const messages: any[] = [];
  let seenSystemPrompts = new Set<string>();
  
  const turnsToProcess = upToTurn 
    ? session.conversations.slice(0, upToTurn)
    : session.conversations;
  
  for (const turn of turnsToProcess) {
    if (turn.request?.messages) {
      const systemMsg = turn.request.messages.find(m => m.role === 'system');
      if (systemMsg && systemMsg.content) {
        const promptHash = systemMsg.content.substring(0, 200);
        if (!seenSystemPrompts.has(promptHash)) {
          seenSystemPrompts.add(promptHash);
          messages.push({ 
            role: 'system', 
            content: systemMsg.content,
            _meta: { turnId: turn.id, timestamp: turn.timestamp }
          });
        }
      }
    }
    
    const userMsg = getUserMessage(turn);
    if (userMsg) {
      messages.push({ 
        role: 'user', 
        content: userMsg,
        _meta: { turnId: turn.id, timestamp: turn.timestamp }
      });
    }
    
    if (turn.request?.messages) {
      const assistantWithTools = turn.request.messages.find(m => m.role === 'assistant' && m.tool_calls);
      if (assistantWithTools) {
        messages.push({
          ...assistantWithTools,
          _meta: { turnId: turn.id, timestamp: turn.timestamp, hasToolCalls: true }
        });
      }
    }
    
    if (turn.request?.messages) {
      const toolMessages = turn.request.messages.filter(m => m.role === 'tool');
      for (const toolMsg of toolMessages) {
        messages.push({
          ...toolMsg,
          _meta: { turnId: turn.id, timestamp: turn.timestamp }
        });
      }
    }
    
    const assistantMsg = getAssistantMessage(turn);
    if (assistantMsg) {
      messages.push({ 
        role: 'assistant', 
        content: assistantMsg,
        _meta: { turnId: turn.id, timestamp: turn.timestamp }
      });
    }
  }
  
  return messages;
};

export const groupToolCallsWithResults = (messages: any[]): any[] => {
  const grouped: any[] = [];
  let i = 0;
  
  while (i < messages.length) {
    const msg = messages[i];
    
    if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls)) {
      const toolCalls = parseToolCalls(msg);
      const toolResults: Map<string, ToolResultInfo> = new Map();
      
      let j = i + 1;
      while (j < messages.length && messages[j].role === 'tool') {
        const toolResult = messages[j];
        if (toolResult.tool_call_id) {
          toolResults.set(toolResult.tool_call_id, {
            tool_call_id: toolResult.tool_call_id,
            content: toolResult.content || '',
            name: toolResult.name
          });
        }
        j++;
      }
      
      grouped.push({
        role: 'tool_group',
        toolCalls,
        toolResults,
        _meta: msg._meta
      });
      
      i = j;
    } else if (msg.role === 'tool') {
      grouped.push({
        role: 'tool_result_orphan',
        content: msg.content,
        tool_call_id: msg.tool_call_id,
        name: msg.name,
        _meta: msg._meta
      });
      i++;
    } else {
      const hasNoContent = msg.role === 'assistant' && 
        (!msg.content || msg.content.trim() === '' || msg.content === 'null');
      
      if (!hasNoContent) {
        grouped.push(msg);
      }
      i++;
    }
  }
  
  return grouped;
};
