import { BadOutputResult } from './probe-types.js';

export const COMMON_STOP_STRINGS = [
    // ChatML
    '<|im_end|>',
    '<|im_start|>',
    '<|endoftext|>',
    // Llama 3
    '<|eot_id|>',
    '<|start_header_id|>',
    '<|end_header_id|>',
    // Generic
    '</s>',
    '[/INST]',
    '[/SYS]',
    // Prevent assistant loop
    '\n\nUser:',
    '\n\nHuman:',
    '\nuser:',
    '\nhuman:',
];

export function detectBadOutput(content: string): BadOutputResult {
    const isLooping = (text: string) => {
        const phrases = text.split('\n');
        for (let i = 0; i < phrases.length - 1; i++) {
            if (phrases[i].length > 20 && phrases[i] === phrases[i + 1]) return true;
        }
        return false;
    };

    const leakedTokens = COMMON_STOP_STRINGS.filter(token => content.includes(token));

    return {
        isLooping: isLooping(content),
        hasLeakedTokens: leakedTokens.length > 0,
        leakedTokens,
        isMalformed: content.includes('{"function": {"name": ""}') || content.includes('"arguments": ""')
    };
}

export function generateXmlToolPrompt(tools: any[]): string {
    let prompt = 'You are a helpful assistant with access to the following tools:\n\n';
    for (const tool of tools) {
        const fn = tool.function;
        prompt += `<tool_definition>\n  <name>${fn.name}</name>\n  <description>${fn.description}</description>\n`;
        if (fn.parameters?.properties) {
            prompt += '  <parameters>\n';
            for (const [name, prop] of Object.entries(fn.parameters.properties)) {
                const p = prop as any;
                prompt += `    <parameter>\n      <name>${name}</name>\n      <type>${p.type}</type>\n      <description>${p.description || ''}</description>\n    </parameter>\n`;
            }
            prompt += '  </parameters>\n';
        }
        prompt += '</tool_definition>\n\n';
    }
    prompt += 'To call a tool, use the following XML format:\n<tool_call>\n  <name>tool_name</name>\n  <arguments>\n    <param_name>value</param_name>\n  </arguments>\n</tool_call>';
    return prompt;
}

export function parseXmlToolCall(content: string): { name: string; arguments: any } | null {
    const nameMatch = content.match(/<name>(.*?)<\/name>/);
    const argsMatch = content.match(/<arguments>([\s\S]*?)<\/arguments>/);

    if (!nameMatch) return null;

    const name = nameMatch[1].trim();
    const args: any = {};

    if (argsMatch) {
        const argStr = argsMatch[1];
        const paramMatches = argStr.matchAll(/<(.*?)>(.*?)<\/\1>/g);
        for (const match of paramMatches) {
            const key = match[1];
            let val: any = match[2].trim();
            // Try to parse as number or boolean
            if (!isNaN(val as any) && val !== '') val = Number(val);
            if (val.toLowerCase() === 'true') val = true;
            if (val.toLowerCase() === 'false') val = false;
            args[key] = val;
        }
    }

    return { name, arguments: args };
}
