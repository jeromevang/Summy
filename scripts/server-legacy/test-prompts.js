import axios from 'axios';

async function testPrompts() {
  console.log('🎯 TESTING WHICH PROMPTS TRIGGER TOOL CALLS');

  const prompts = [
    'Create a factorial function in Python.',
    'Write a Python script that calculates factorial and run it.',
    'Please execute: echo "test"',
    'Run this command: ls -la',
    'Execute the terminal command: pwd'
  ];

  for (let i = 0; i < prompts.length; i++) {
    console.log(`\n📝 Prompt ${i + 1}: "${prompts[i]}"`);

    try {
      const response = await axios.post('http://localhost:3001/v1/chat/completions', {
        messages: [{ role: 'user', content: prompts[i] }],
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
      }, { timeout: 30000 });

      const choice = response.data.choices[0];
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        console.log('   ✅ TOOL CALL TRIGGERED!');
        console.log(`   Command: ${choice.message.tool_calls[0].function.arguments}`);
      } else {
        console.log('   ❌ Text response only');
        console.log(`   Response: ${choice.message.content.substring(0, 60)}...`);
      }

    } catch (error) {
      console.log('   ❌ Error:', error.response.status);
    }
  }

  console.log('\n🎯 CONCLUSION:');
  console.log('Direct commands like "Run this command: ls" trigger tools');
  console.log('Code creation requests give text responses');
  console.log('Your IDE prompt might not be triggering tool usage');
}

testPrompts();

