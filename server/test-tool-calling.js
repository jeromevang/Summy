import axios from 'axios';

async function testToolCalling() {
  console.log('Testing tool calling with dual-model enabled...');

  const tools = [{
    type: 'function',
    function: {
      name: 'run_terminal_command',
      description: 'Execute a terminal command and return the output',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The terminal command to execute' }
        },
        required: ['command']
      }
    }
  }];

  try {
    const response = await axios.post('http://localhost:3001/v1/chat/completions', {
      messages: [{ role: 'user', content: 'Please run the command: echo Hello from dual-model test' }],
      model: 'qwen/qwen2.5-coder-32b-instruct',
      tools: tools,
      tool_choice: 'auto',
      temperature: 0.1
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    console.log('✅ Tool calling response received');
    if (response.data.choices && response.data.choices[0]) {
      const choice = response.data.choices[0];
      console.log('Finish reason:', choice.finish_reason);
      console.log('Response:', choice.message.content?.substring(0, 200));

      if (choice.message.tool_calls) {
        console.log('✅ TOOL CALLS MADE:', choice.message.tool_calls.length);
        choice.message.tool_calls.forEach((call, idx) => {
          console.log(`  ${idx + 1}. ${call.function.name}: ${call.function.arguments}`);
        });
      } else {
        console.log('❌ No tool calls - dual model not activated');
      }
    }
  } catch (error) {
    console.log('❌ Tool calling failed:', error.response?.status, error.response?.data?.message || error.message);
  }
}

testToolCalling();

