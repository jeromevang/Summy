import axios from 'axios';

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

    // Also test what the simulated tool prompt looks like
    console.log('\\n=== TESTING SIMULATED TOOL PROMPT ===');
    console.log('Tool prompt that would be added:');
    const toolPrompt = `You have access to the following tools:

run_terminal_command: Execute a terminal command and return the output
  Parameters:
  - command (string): The terminal command to execute

When you want to use a tool, respond with a JSON object in this exact format:
{"tool_name": "function_name", "parameters": {"param1": "value1"}}

Do not include any other text in your response when using tools.`;
    console.log(toolPrompt);

    console.log('\\n=== TESTING BASIC COMPLETION FIRST ===');
    // Test basic completion without tools first - use a simple API call
    const basicResponse = await axios.post('http://localhost:3001/api/tooly/models/allenai%2Folmo-3.1-32b-think/test', {
      messages: [{ role: 'user', content: 'Say hello!' }],
      tools: [],
      temperature: 0.1
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('Basic completion response:');
    console.log(JSON.stringify(basicResponse.data, null, 2));

    console.log('Sending request to intent router...');

    const response = await axios.post('http://localhost:3001/api/tooly/combo-test/quick', {
      mainModelId: 'allenai/olmo-3.1-32b-think',
      executorModelId: 'allenai/olmo-3.1-32b-think',
      contextSize: 4096
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