import axios from 'axios';

async function test() {
    const url = 'http://localhost:1234/v1/chat/completions';
    const model = 'unsloth/qwen3-coder-30b-a3b-instruct';

    const messages = [
        { role: 'user', content: 'test' }
    ];

    console.log('--- TEST: Request WITH "user" field containing | ---');
    try {
        const res = await axios.post(url, {
            model,
            messages,
            user: "google-oauth2|107891203322945891736",
            stream: false
        });
        console.log('Result: SUCCESS');
    } catch (e: any) {
        console.log('Result: FAILED');
        console.log('Error:', e.response?.data?.error?.message || e.message);
    }

    console.log('\n--- TEST: Request WITHOUT "user" field ---');
    try {
        const res2 = await axios.post(url, {
            model,
            messages,
            stream: false
        });
        console.log('Result: SUCCESS');
    } catch (e: any) {
        console.log('Result: FAILED');
        console.log('Error:', e.response?.data?.error?.message || e.message);
    }
}

test();
