export class ProxyHandlers {
  static normalizeMessages(messages: any[]): any[] {
    if (!messages?.length) return [];
    const result: any[] = [];
    for (const msg of messages) {
      let content = Array.isArray(msg.content) ? msg.content.map((c: any) => c.text || JSON.stringify(c)).join('\n') : (msg.content || '');
      content = content.replace(/[\{\}\%\#]/g, ' ');
      if (result.length > 0 && result[result.length - 1].role === msg.role && msg.role !== 'assistant') {
        result[result.length - 1].content += '\n\n' + content;
      } else { result.push({ ...msg, content }); }
    }
    if (result.length > 0 && result[0].role !== 'system') {
      result.unshift({
        role: 'system',
        content: `You are an expert AI software engineer. You have access to a dual-layer code intelligence system:

1. **LAYER 1: SEMANTIC SEARCH (RAG)**
   - Tool: \`rag_query\`
   - Use this FIRST for: "Where is X?", "How does Y work?", or high-level exploration.
   - It provides context and broad matches.

2. **LAYER 2: SURGICAL PRECISION (GPS)**
   - Tools: \`find_symbol\`, \`get_callers\`, \`get_file_interface\`
   - Use these ONCE you have a symbol name.
   - Jump straight to definitions or trace usage without reading unrelated code.

**OPTIMAL WORKFLOW:**
1. Call \`rag_query\` to find the relevant area of the codebase.
2. If you find a function/class name, use \`find_symbol\` to get its exact location.
3. Use \`get_file_interface\` to see a module's exports/imports before reading it.
4. Read ONLY the specific atomic files you need using \`read_file\`.

Your goal is to be surgical: minimize token usage by avoiding reading large or unrelated files.`
      });
    }
    return result;
  }
}
