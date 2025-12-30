import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult, errorResult } from "../utils/helpers.js";

export function registerHttpTools(server: McpServer) {
  server.registerTool("http_request", {
    description: "Make an HTTP request",
    inputSchema: {
      url: z.string().describe("URL to request"),
      method: z.string().optional().describe("HTTP method (default: GET)"),
      headers: z.record(z.string()).optional().describe("Request headers"),
      body: z.string().optional().describe("Request body"),
      timeout: z.number().optional().describe("Timeout in milliseconds")
    }
  }, async ({ url, method = "GET", headers = {}, body, timeout = 30000 }: { 
    url: string; method?: string; headers?: Record<string, string>; body?: string; timeout?: number
  }) => {
    console.error(`[MCP] http_request: ${method} ${url}`);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const requestHeaders: Record<string, string> = { ...headers };
      if (body && !requestHeaders['Content-Type']) {
        requestHeaders['Content-Type'] = 'application/json';
      }

      const res = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body || undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const responseText = await res.text();

      return textResult(JSON.stringify({
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        body: responseText.slice(0, 10000)
      }, null, 2));
    } catch (err: any) {
      return errorResult(`HTTP request failed: ${err.message}`);
    }
  });

  server.registerTool("url_fetch_content", {
    description: "Fetch the content of a URL and return readable text. For simple pages, uses HTTP fetch. For JS-heavy pages, use browser tools instead.",
    inputSchema: {
      url: z.string().describe("URL to fetch content from"),
      extractText: z.boolean().optional().describe("Extract readable text from HTML (default: true)")
    }
  }, async ({ url, extractText = true }: { url: string; extractText?: boolean }) => {
    console.error(`[MCP] url_fetch_content: ${url}`);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        return errorResult(`HTTP ${res.status}: ${res.statusText}`);
      }

      const contentType = res.headers.get('content-type') || '';
      const body = await res.text();

      if (extractText && contentType.includes('text/html')) {
        let text = body
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')
          .trim();

        if (text.length > 15000) {
          text = text.slice(0, 15000) + '\n\n[Content truncated...]';
        }

        return textResult(text);
      }

      const result = body.length > 15000 ? body.slice(0, 15000) + '\n\n[Content truncated...]' : body;
      return textResult(result);
    } catch (err: any) {
      return errorResult(`Failed to fetch URL: ${err.message}`);
    }
  });

  server.registerTool("web_search", {
    description: "Search the web for information",
    inputSchema: { query: z.string().describe("Search query") }
  }, async ({ query }: { query: string }) => {
    console.error(`[MCP] web_search: ${query}`);
    try {
      // For now, redirect to DuckDuckGo or similar or use a search API if available
      // Here we'll simulate a search result or use a basic fetch if possible
      return textResult(`Searching for "${query}"... (In a real implementation, this would call a search API)`);
    } catch (err: any) {
      return errorResult(`Search failed: ${err.message}`);
    }
  });
}
