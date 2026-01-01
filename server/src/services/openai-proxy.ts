/**
 * OpenAI Proxy Service
 * Provides a proxy server for OpenAI API calls, potentially adding features like logging, caching, or routing.
 */

import { OpenAIProxy } from './openai-proxy/OpenAIProxyServer.js';

/**
 * The singleton instance of the OpenAI Proxy Server.
 */
export { OpenAIProxy };

/**
 * Default export of the OpenAIProxy instance.
 */
export default OpenAIProxy;