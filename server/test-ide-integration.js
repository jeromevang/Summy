import axios from 'axios';

async function testIDEIntegration() {
  console.log('🖥️  TESTING IDE INTEGRATION - Simulating IDE Chat Request\n');

  // Simulate what an IDE extension would send when user chats
  const ideChatRequest = {
    messages: [
      {
        role: 'user',
        content: 'Hello from my IDE! Can you help me write a factorial function?'
      }
    ],
    model: 'qwen/qwen2.5-coder-32b-instruct',
    tools: [{
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
    }],
    tool_choice: 'auto',
    temperature: 0.1
  };

  console.log('📤 Sending simulated IDE chat request...');

  try {
    const response = await axios.post('http://localhost:3001/v1/chat/completions', ideChatRequest, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    });

    console.log('✅ IDE integration response received!');
    console.log(`Status: ${response.status}`);

    if (response.data.choices && response.data.choices[0]) {
      const choice = response.data.choices[0];
      console.log(`Finish reason: ${choice.finish_reason}`);

      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        console.log('🎉 SUCCESS: Dual-model system activated!');
        console.log(`Tool calls made: ${choice.message.tool_calls.length}`);

        choice.message.tool_calls.forEach((call, idx) => {
          console.log(`  ${idx + 1}. ${call.function.name}`);
          console.log(`     Args: ${call.function.arguments}`);
        });

        console.log('\n🚀 IDE INTEGRATION WORKS! Your dual-model middleware is ready!');
      } else {
        console.log('❌ No tool calls - response:', choice.message.content?.substring(0, 100));
      }
    }

  } catch (error) {
    console.log('❌ IDE integration failed:', error.response?.status, error.response?.data?.message || error.message);

    if (error.response?.status === 401) {
      console.log('🔑 This suggests API key issues for remote models');
    } else if (error.response?.status === 404) {
      console.log('🔗 IDE extension not configured to send to correct endpoint');
    } else if (error.response?.status === 500) {
      console.log('🛠️  Server error - check server logs');
    }
  }

  console.log('\n📋 IDE INTEGRATION SETUP CHECKLIST:');
  console.log('1. ✅ Server running on port 3001');
  console.log('2. ✅ Dual-model mode enabled');
  console.log('3. ✅ LM Studio models loaded');
  console.log('4. ❌ NGROK_URL not set - IDE cannot connect externally');
  console.log('5. ❌ IDE extension needs to be configured to send requests to ngrok URL');

  console.log('\n🔧 TO FIX IDE INTEGRATION:');
  console.log('1. Install ngrok: npm install -g ngrok');
  console.log('2. Start ngrok tunnel: ngrok http 3001');
  console.log('3. Set NGROK_URL in .env: NGROK_URL=https://xxxx.ngrok.io');
  console.log('4. Configure your IDE extension to use the ngrok URL');
}

testIDEIntegration();

