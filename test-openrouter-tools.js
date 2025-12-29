const axios = require('axios');

async function testActualToolCalling() {
  try {
    console.log('Testing actual tool calling with OpenRouter...');

    // Test with a real tool that should trigger function calling
    const tools = [
      {
        type: 'function',
        function: {
          name: 'run_terminal_command',
          description: 'Execute a terminal command and return the output',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'The terminal command to execute'
              }
            },
            required: ['command']
          }
        }
      }
    ];

    const messages = [
      {
        role: 'user',
        content: 'Can you run the command "echo Hello World" for me?'
      }
    ];

    console.log('Sending request to intent router...');

    const response = await axios.post('http://localhost:3001/api/tooly/route', {
      messages,
      tools,
      provider: 'openrouter',
      mainModelId: 'allenai/olmo-3.1-32b-think',
      executorModelId: 'allenai/olmo-3.1-32b-think'
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('Full Response:');
    console.log(JSON.stringify(response.data, null, 2));

    // Check if tool calls were generated
    if (response.data && response.data.toolCalls && response.data.toolCalls.length > 0) {
      console.log('✅ Tool calls detected!');
      response.data.toolCalls.forEach((call, i) => {
        console.log(`Tool call ${i+1}:`, call);
      });
    } else {
      console.log('❌ No tool calls found in response');
      console.log('Response content:', response.data?.finalResponse);
    }

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    if (error.response?.status) {
      console.log('Status code:', error.response.status);
    }
  }
}

testActualToolCalling();

