import axios from 'axios';

async function test3Combos() {
  console.log('🧪 TESTING 3 SPECIFIC COMBOS VIA COMBO TEST ENDPOINT\n');

  // Test combos:
  // 1. LM Studio main + LM Studio executor
  // 2. OpenRouter main + LM Studio executor
  // 3. LM Studio main + OpenRouter executor

  const combos = [
    {
      name: 'LM Studio + LM Studio (Full Local)',
      mainModelId: 'qwen/qwen2.5-coder-32b-instruct',
      executorModelId: 'qwen/qwen2.5-coder-14b-instruct',
      expectedMainProvider: 'lmstudio',
      expectedExecutorProvider: 'lmstudio'
    },
    {
      name: 'OpenRouter + LM Studio (Remote Main)',
      mainModelId: 'allenai/olmo-3.1-32b-think',
      executorModelId: 'qwen/qwen2.5-coder-32b-instruct',
      expectedMainProvider: 'openrouter',
      expectedExecutorProvider: 'lmstudio'
    },
    {
      name: 'LM Studio + OpenRouter (Remote Executor)',
      mainModelId: 'qwen/qwen2.5-coder-32b-instruct',
      executorModelId: 'allenai/olmo-3.1-32b-think',
      expectedMainProvider: 'lmstudio',
      expectedExecutorProvider: 'openrouter'
    }
  ];

  for (let i = 0; i < combos.length; i++) {
    const combo = combos[i];
    console.log(`\n🔍 COMBO ${i + 1}: ${combo.name}`);
    console.log(`Main: ${combo.mainModelId} (${combo.expectedMainProvider})`);
    console.log(`Executor: ${combo.executorModelId} (${combo.expectedExecutorProvider})`);

    try {
      const response = await axios.post('http://localhost:3001/api/tooly/combo-test/quick', {
        mainModelId: combo.mainModelId,
        executorModelId: combo.executorModelId,
        contextSize: 4096
      }, {
        headers: { 'Content-Type': 'application/json' }
      });

      console.log('✅ Combo test response received');
      console.log(`Total tests: ${response.data.result.totalTests}`);
      console.log(`Passed tests: ${response.data.result.passedTests}`);
      console.log(`Overall score: ${response.data.result.overallScore}`);

      if (response.data.result.testResults && response.data.result.testResults.length > 0) {
        const firstTest = response.data.result.testResults[0];
        console.log(`First test result: ${firstTest.passed ? '✅ PASS' : '❌ FAIL'} - ${firstTest.error || 'No error'}`);
      }

    } catch (error) {
      console.log('❌ Combo test failed:', error.response?.status, error.response?.data?.error || error.message);
    }

    console.log('─'.repeat(60));
  }

  console.log('\n🎯 NOW TESTING VIA CHAT ENDPOINT WITH TOOL CALLING\n');

  // Test the same combos via chat endpoint with tool calling
  const toolPrompt = 'Please help me create a function that calculates the factorial of a number, then test it by running the function.';

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

  for (let i = 0; i < combos.length; i++) {
    const combo = combos[i];
    console.log(`\n🔧 TOOL CALLING TEST ${i + 1}: ${combo.name}`);

    try {
      // Use the OpenAI proxy endpoint with tools to trigger intent routing
      const response = await axios.post('http://localhost:3001/v1/chat/completions', {
        messages: [
          {
            role: 'user',
            content: toolPrompt
          }
        ],
        model: combo.mainModelId, // Use main model, intent router will handle executor
        tools: tools,
        tool_choice: 'auto',
        temperature: 0.1,
        // Add combo configuration for dual-model mode
        combo_config: {
          enableDualModel: true,
          mainModelId: combo.mainModelId,
          executorModelId: combo.executorModelId
        }
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      });

      console.log('✅ Tool calling response received');
      if (response.data.choices && response.data.choices[0]) {
        const choice = response.data.choices[0];
        console.log(`Finish reason: ${choice.finish_reason}`);
        console.log(`Response content: ${choice.message.content?.substring(0, 150)}...`);

        if (choice.message.tool_calls) {
          console.log(`✅ Tool calls made: ${choice.message.tool_calls.length}`);
          choice.message.tool_calls.forEach((call, idx) => {
            console.log(`  Call ${idx + 1}: ${call.function.name}`);
            console.log(`    Args: ${call.function.arguments}`);
          });
        } else {
          console.log('❌ No tool calls made - model did not use tools');
        }
      }

    } catch (error) {
      console.log('❌ Tool calling test failed:', error.response?.status, error.response?.data?.error || error.message);
    }

    console.log('─'.repeat(60));
  }
}

test3Combos();
