import axios from 'axios';

async function test() {
    const url = 'http://localhost:1234/v1/chat/completions';
    const model = 'unsloth/qwen3-coder-30b-a3b-instruct';

    const messages = [
        { role: 'user', content: 'test' }
    ];

    const tools = [
        {
            type: 'function',
            function: {
                name: 'test_tool',
                description: 'A tool with curly braces in description: {{ something }}',
                parameters: { type: 'object', properties: {} }
            }
        }
    ];

    console.log('--- TEST: Tool with {{ }} in description ---');
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
