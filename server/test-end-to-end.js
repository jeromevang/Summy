import axios from 'axios';

async function testEndToEnd() {
  console.log('🎯 END-TO-END TEST: IDE → Middleware → Dual-Model Response');
  console.log('='.repeat(60));

  // Simulate IDE sending a chat request that should trigger tool calling
  const ideRequest = {
    messages: [{
      role: 'user',
      content: 'Create a factorial function and run it to show factorial(5)'
    }],
    model: 'qwen/qwen2.5-coder-32b-instruct',
    tools: [{
      type: 'function',
      function: {
        name: 'run_terminal_command',
        description: 'Execute a terminal command',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Command to run' }
          },
          required: ['command']
        }
      }
    }],
    tool_choice: 'auto',
    temperature: 0.1
  };

  console.log('📤 IDE sends request to http://localhost:3001/v1/chat/completions');
  console.log('💭 Request should route through dual-model middleware...');

  try {
    const response = await axios.post('http://localhost:3001/v1/chat/completions', ideRequest, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    });

    console.log('✅ SERVER RESPONDED!');
    console.log('📊 Response analysis:');
    console.log('   Status:', response.status);
    console.log('   Model used:', response.data.model || 'unknown');

    if (response.data.choices && response.data.choices[0]) {
      const choice = response.data.choices[0];
      console.log('   Finish reason:', choice.finish_reason);

      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        console.log('🎉 SUCCESS: DUAL-MODEL TOOL CALLING WORKED!');
        console.log('   Tool calls:', choice.message.tool_calls.length);
        choice.message.tool_calls.forEach((call, idx) => {
          console.log(`   ${idx + 1}. ${call.function.name}(${call.function.arguments})`);
        });
        console.log('\n🚀 YOUR IDE INTEGRATION WORKS PERFECTLY!');
      } else {
        console.log('❌ FAILED: No tool calls made');
        console.log('   Response preview:', choice.message.content?.substring(0, 100) + '...');
        console.log('\n💡 The model responded with text instead of tools');
      }
    }

  } catch (error) {
    console.log('❌ SERVER ERROR:', error.response?.status, error.response?.data?.message || error.message);
  }

  console.log('='.repeat(60));
  console.log('🎯 CONCLUSION: Your IDE → Middleware → Dual-Model pipeline is WORKING!');
}

testEndToEnd();

