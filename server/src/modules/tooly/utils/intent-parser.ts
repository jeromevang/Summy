import { IntentSchema } from '../types.js';

export class IntentParser {
  private static readonly TOOL_CALL_PATTERNS: Array<{ name: string; regex: RegExp; jsonGroup: number }> = [
    { name: 'tool_call', regex: /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/i, jsonGroup: 1 },
    { name: 'TOOL_REQUEST', regex: /\[TOOL_REQUEST\]\s*(\{[\s\S]*?\})\s*\[END_TOOL_RESULT\]/i, jsonGroup: 1 },
    { name: 'function_call', regex: /<function_call>\s*(\{[\s\S]*?\})\s*<\/function_call>/i, jsonGroup: 1 },
    { name: 'pipe_tool_call', regex: /<\|tool_call\|>\s*(\{[\s\S]*?\})\s*<\|\/tool_call\|>/i, jsonGroup: 1 },
    { name: 'bracket_tool_call', regex: /\[\[tool_call\]\]\s*(\{[\s\S]*?\})\s*\[\[\/tool_call\]\]/i, jsonGroup: 1 },
    { name: 'action', regex: /<action>\s*(\{[\s\S]*?\})\s*<\/action>/i, jsonGroup: 1 },
    { name: 'FUNCTION_CALL', regex: /FUNCTION_CALL:\s*(\{[\s\S]*?\})/i, jsonGroup: 1 },
    { name: 'tool', regex: /<tool>\s*(\{[\s\S]*?\})\s*<\/tool>/i, jsonGroup: 1 },
    { name: 'START_TOOL_CALL', regex: /\[START_TOOL_CALL\]\s*(\{[\s\S]*?\})\s*\[END_TOOL_CALL\]/i, jsonGroup: 1 },
    { name: 'hermes_tool', regex: /<tool_call>\s*(\w+)\s*\(([\s\S]*?)\)\s*<\/tool_call>/i, jsonGroup: 0 },
  ];

  static cleanToolCallFormats(content: string): string {
    let cleaned = content;
    for (const pattern of IntentParser.TOOL_CALL_PATTERNS) {
      cleaned = cleaned.replace(new RegExp(pattern.regex.source, 'gi'), '');
    }
    cleaned = cleaned
      .replace(/<[a-z_]+>\s*\{[\s\S]*?\}\s*<\/[a-z_]+>/gi, '')
      .replace(/\[[A-Z_]+\]\s*\{[\s\S]*?\}\s*\[\/[A-Z_]+\]/gi, '')
      .replace(/\[[A-Z_]+\]\s*\{[\s\S]*?\}\s*\[[A-Z_]+\]/gi, '')
      .trim();
    return cleaned;
  }

  static extractToolFromJson(json: any): { tool: string; parameters: Record<string, any> } | null {
    const toolName = json.name || json.tool || json.function || json.tool_name || json.function_name;
    if (!toolName) return null;
    const params = json.arguments || json.parameters || json.params || json.args || json.input || {};
    const parsedParams = typeof params === 'string' ? JSON.parse(params) : params;
    return { tool: toolName, parameters: parsedParams };
  }

  static parseIntent(response: any): IntentSchema {
    let content = response?.choices?.[0]?.message?.content || '';
    content = content.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '').trim();

    for (const pattern of IntentParser.TOOL_CALL_PATTERNS) {
      const match = content.match(pattern.regex);
      if (match) {
        try {
          if (pattern.name === 'hermes_tool' && match[1] && match[2]) {
            let params = {};
            try { params = JSON.parse(match[2]); } catch { params = { input: match[2] }; }
            return { schemaVersion: '1.0', action: 'call_tool', tool: match[1], parameters: params, metadata: { reasoning: `Parsed from ${pattern.name} format` } };
          }
          const toolJson = JSON.parse(match[pattern.jsonGroup]);
          const extracted = this.extractToolFromJson(toolJson);
          if (extracted) {
            const textBefore = content.split(match[0])[0].trim();
            return { schemaVersion: '1.0', action: 'call_tool', tool: extracted.tool, parameters: extracted.parameters, metadata: { reasoning: textBefore || `Parsed from ${pattern.name} format` } };
          }
        } catch {}
      }
    }

    try {
      const jsonMatches = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
      if (jsonMatches) {
        for (const match of jsonMatches) {
          try {
            const parsed = JSON.parse(match);
            if (parsed.action) return { schemaVersion: '1.0', action: parsed.action, tool: parsed.tool, parameters: parsed.parameters, metadata: { response: parsed.response, question: parsed.question, reasoning: parsed.reasoning } };
            const extracted = this.extractToolFromJson(parsed);
            if (extracted) {
              const textBefore = content.split(match)[0].trim();
              return { schemaVersion: '1.0', action: 'call_tool', tool: extracted.tool, parameters: extracted.parameters, metadata: { reasoning: textBefore || 'Parsed from raw JSON' } };
            }
          } catch {}
        }
      }
    } catch {}

    const cleanContent = this.cleanToolCallFormats(content);
    return cleanContent ? { schemaVersion: '1.0', action: 'respond', metadata: { response: cleanContent, reasoning: 'Model responded naturally' } }
                        : { schemaVersion: '1.0', action: 'respond', metadata: { reasoning: 'Could not parse intent, defaulting to text response' } };
  }
}
