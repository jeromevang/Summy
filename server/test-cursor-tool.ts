import axios from 'axios';

async function test() {
    const url = 'http://localhost:1234/v1/chat/completions';
    const model = 'unsloth/qwen3-coder-30b-a3b-instruct';

    const messages = [
        { role: 'user', content: 'test' }
    ];

    const tools = [
        {
            "type": "function",
            "function": {
                "name": "mcp_cursor-browser-extension_browser_navigate",
                "description": "Navigate to a URL",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "The URL to navigate to"
                        }
                    },
                    "required": [
                        "url"
                    ],
                    "additionalProperties": false
                }
            }
        }
    ];

    console.log('--- TEST: Tool with additionalProperties: false and hyphenated name ---');
    try {
        const res = await axios.post(url, {
            model,
            messages,
            tools,
            stream: false,
            parallel_tool_calls: false
        });
        console.log('Result: SUCCESS');
    } catch (e: any) {
        console.log('Result: FAILED');
        console.log('Error:', e.response?.data?.error?.message || e.message);
    }
}

test();
