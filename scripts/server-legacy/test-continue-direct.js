import axios from 'axios';

async function testContinueDirect() {
  console.log('🧪 TESTING CONTINUE → SUMMY MIDDLEWARE DIRECTLY');

  // Simulate what Continue sends
  const continueRequest = {
    messages: [{
      role: 'user',
      content: 'Help me read the package.json file in this project'
    }],
    model: 'qwen/qwen2.5-coder-32b-instruct',
    tools: [{
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read the contents of a file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file to read' }
          },
          required: ['path']
        }
      }
    }],
    tool_choice: 'auto',
    temperature: 0.1,
    stream: false
  };

  console.log('📤 Sending to http://localhost:3001/v1/chat/completions');

  try {
    const response = await axios.post('http://localhost:3001/v1/chat/completions', continueRequest, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    console.log('✅ RESPONSE RECEIVED!');
    console.log('Status:', response.status);
    console.log('Finish reason:', response.data.choices[0].finish_reason);

    const message = response.data.choices[0].message;
    console.log('Has tool_calls:', !!message.tool_calls);

    if (message.tool_calls && message.tool_calls.length > 0) {
      console.log('🎉 SUCCESS: TOOL CALLS GENERATED!');
      message.tool_calls.forEach((call, idx) => {
        console.log(`${idx + 1}. ${call.function.name}: ${call.function.arguments}`);
      });
    } else {
      console.log('❌ FAILURE: No tool calls - this is why "nothing happens"');
      console.log('Content preview:', message.content ? message.content.substring(0, 100) + '...' : 'null');
    }

  } catch (error) {
    console.log('❌ REQUEST FAILED:', error.response?.status, error.response?.data?.message || error.message);
  }
}

testContinueDirect();

