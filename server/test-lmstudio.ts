import axios from 'axios';

async function test() {
    const url = 'http://localhost:1234/v1/chat/completions';
    const model = 'qwen/qwen3-coder-30b';
    const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' }
    ];

    console.log('--- TEST 1: Basic Chat (No Tools) ---');
    try {
        const res1 = await axios.post(url, {
            model,
            messages,
            stream: false
        });
        console.log('Result:', JSON.stringify(res1.data.choices[0].message));
    } catch (e: any) {
        console.error('Error:', e.response?.data || e.message);
    }

    console.log('\n--- TEST 2: Chat with Tools ---');
    try {
        const res2 = await axios.post(url, {
            model,
            messages,
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'get_time',
                        description: 'Gets current time',
                        parameters: { type: 'object', properties: {} }
                    }
                }
            ],
            stream: false
        });
        console.log('Result:', JSON.stringify(res2.data.choices[0].message));
    } catch (e: any) {
        console.error('Error:', e.response?.data || e.message);
    }
}

test();
