import axios from 'axios';
import fs from 'fs';

const tools = [
    {
        "type": "function",
        "function": {
            "name": "codebase_search",
            "description": "`codebase_search`: semantic search that finds code... <Truncated in logs> ...range to read multiple chunks from a file at once.",
            "parameters": {
                "type": "object",
                "properties": {
                    "explanation": {
                        "type": "string",
                        "description": "One sentence explanation as to why this tool is being used, and how it contributes to the goal."
                    },
                    "query": {
                        "type": "string",
                        "description": "A complete question about what you want to underst... <Truncated in logs> ...k?', 'What happens when Y?', 'Where is Z handled?'"
                    },
                    "target_directories": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        },
                        "description": "Prefix directory paths to limit search scope (single directory only, no glob patterns)"
                    }
                },
                "required": [
                    "explanation",
                    "query",
                    "target_directories"
                ]
            }
        }
    }
    // ... more tools will be added here based on the logs
];

async function testTools(toolSubset: any[]) {
    const url = 'http://localhost:1234/v1/chat/completions';
    const body = {
        model: 'unsloth/qwen3-coder-30b-a3b-instruct',
        messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'test' }
        ],
        tools: toolSubset,
        stream: false
    };

    try {
        await axios.post(url, body);
        return true;
    } catch (e: any) {
        console.log(`Error with tools: ${toolSubset.map(t => t.function.name).join(', ')}`);
        console.log(e.response?.data?.error?.message || e.message);
        return false;
    }
}

// I will fill this with real tools from the logs in the next step
