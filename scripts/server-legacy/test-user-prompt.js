import axios from 'axios';

async function testUserPrompt() {
  console.log('🧪 TESTING USER PROMPT: "really ok, well what is this project about?"');

  const userPrompt = 'really ok, well what is this project about?';

  const request = {
    messages: [{
      role: 'user',
      content: userPrompt
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
    temperature: 0.1
  };

  console.log('Sending user prompt to middleware...');

  try {
    const response = await axios.post('http://localhost:3001/v1/chat/completions', request, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    const message = response.data.choices[0].message;
    console.log('Has tool_calls:', !!message.tool_calls);

    if (message.tool_calls && message.tool_calls.length > 0) {
      console.log('✅ WOULD TRIGGER TOOL CALLS');
    } else {
      console.log('❌ NO TOOL CALLS - JUST TEXT RESPONSE');
      console.log('Response preview:', message.content ? message.content.substring(0, 200) + '...' : 'null');
      console.log('\n🎯 THIS IS WHY "NOTHING HAPPENS"');
      console.log('The user\'s prompt doesn\'t request any tool usage');
    }

  } catch (error) {
    console.log('Error:', error.response?.data?.message || error.message);
  }
}

testUserPrompt();

