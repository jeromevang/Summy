import axios from 'axios';

async function test() {
    const url = 'http://localhost:1234/v1/chat/completions';
    const model = 'unsloth/qwen3-coder-30b-a3b-instruct';

    const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello! Please use a tool if you can.' }
    ];

    const tools = [
        {
            type: 'function',
            function: {
                name: 'get_weather',
                description: 'Get the weather',
                parameters: { type: 'object', properties: {} }
            }
        }
    ];

    console.log('--- TEST: With Tools, NO parallel_tool_calls ---');
    try {
        const res1 = await axios.post(url, {
            model,
            messages,
            tools,
            stream: false
        });
        console.log('Result 1: SUCCESS');
    } catch (e: any) {
        console.log('Result 1: FAILED');
        console.log('Error:', e.response?.data?.error?.message || e.message);
    }

    console.log('\n--- TEST: With Tools, parallel_tool_calls: false ---');
    try {
        const res2 = await axios.post(url, {
            model,
            messages,
            tools,
            parallel_tool_calls: false,
            stream: false
        });
        console.log('Result 2: SUCCESS');
    } catch (e: any) {
        console.log('Result 2: FAILED');
        console.log('Error:', e.response?.data?.error?.message || e.message);
    }
}

test();
