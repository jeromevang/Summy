import axios from 'axios';
import { ProxyHandlers } from './ProxyHandlers.js';
import { intentRouter } from '../../modules/tooly/intent-router.js';
import { extractPatternFromCorrection, addPatternToMemory, initializeMemory } from '../../modules/tooly/learning/learning-system.js';
import { db } from '../database.js';

export class OpenAIProxy {
  static async proxyToOpenAI(req: any, res: any) {
    const messages = ProxyHandlers.normalizeMessages(req.body?.messages);
    const modelId = req.body?.model || process.env.LMSTUDIO_MODEL || 'unknown';
    
    // Check for user corrections in the last message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'user' && messages.length > 2) {
      const prevAssistantMessage = messages[messages.length - 2];
      const prevUserMessage = messages[messages.length - 3];
      
      if (prevAssistantMessage?.role === 'assistant' && prevUserMessage?.role === 'user') {
        const pattern = extractPatternFromCorrection(
          prevAssistantMessage.content,
          lastMessage.content,
          prevUserMessage.content
        );
        
        if (pattern) {
          console.log(`[Learning] Extracted pattern from correction: ${pattern.action}`);
          // In a real implementation, we would load the actual memory for this model/project
          const memory = initializeMemory();
          addPatternToMemory(memory, pattern);
          // Persistence logic would go here
        }
      }
    }

    try {
      // Route through intent router for agentic execution
      const result = await intentRouter.route(messages, req.body?.tools);
      res.json(result.finalResponse);
    } catch (error: any) {
      console.error('[Proxy] Routing failed:', error.message);
      res.status(500).json({ error: 'Proxy routing failed', message: error.message });
    }
  }
}
