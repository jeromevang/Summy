import axios from 'axios';

async function test() {
    const url = 'http://localhost:1234/v1/chat/completions';
    const model = 'unsloth/qwen3-coder-30b-a3b-instruct';

    const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello! Please use a tool if you can.' }
    ];

    // Generate 50 dummy tools
    const tools = [];
    for (let i = 0; i < 50; i++) {
        tools.push({
            type: 'function',
            function: {
                name: `tool_${i}`,
                description: `This is tool number ${i}. It does something useful.`,
                parameters: {
                    type: 'object',
                    properties: {
                        param1: { type: 'string', description: `Parameter for tool ${i}` }
                    }
                }
            }
        });
    }

    console.log('--- TEST: With 50 Tools ---');
    try {
        const res = await axios.post(url, {
            model,
            messages,
            tools,
            stream: false
        });
        console.log('Result: SUCCESS');
    } catch (e: any) {
        console.log('Result: FAILED');
        console.log('Error:', e.response?.data?.error?.message || e.message);
    }
}

test();
