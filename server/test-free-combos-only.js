import axios from 'axios';

async function testFreeCombosOnly() {
  console.log('🆓 TESTING ONLY TRULY FREE LM STUDIO MODELS\n');

  // Test combos using only LM Studio models (no API costs)
  const freeCombos = [
    {
      name: 'LM Studio Large + LM Studio Medium',
      mainModelId: 'qwen/qwen2.5-coder-32b-instruct',
      executorModelId: 'qwen/qwen2.5-coder-14b-instruct',
      expectedMainProvider: 'lmstudio',
      expectedExecutorProvider: 'lmstudio'
    },
    {
      name: 'LM Studio Medium + LM Studio Small',
      mainModelId: 'qwen/qwen2.5-coder-14b-instruct',
      executorModelId: 'qwen2.5-coder-1.5b-instruct',
      expectedMainProvider: 'lmstudio',
      expectedExecutorProvider: 'lmstudio'
    },
    {
      name: 'LM Studio DeepSeek + LM Studio Qwen',
      mainModelId: 'deepseek-r1-distill-qwen-14b',
      executorModelId: 'qwen/qwen2.5-coder-32b-instruct',
      expectedMainProvider: 'lmstudio',
      expectedExecutorProvider: 'lmstudio'
    }
  ];

  for (let i = 0; i < freeCombos.length; i++) {
    const combo = freeCombos[i];
    console.log(`🔍 COMBO ${i + 1}: ${combo.name}`);
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
      console.log(`Passed tests: ${response.data.result.passedTests || 0}`);
      console.log(`Overall score: ${response.data.result.overallScore}`);
      console.log(`Qualifying gate passed: ${response.data.result.qualifyingGatePassed}`);

      if (response.data.result.testResults && response.data.result.testResults.length > 0) {
        const firstTest = response.data.result.testResults[0];
        console.log(`Sample test result: ${firstTest.passed ? '✅ PASS' : '❌ FAIL'} - ${firstTest.error || 'Success'}`);
      }

    } catch (error) {
      console.log('❌ Combo test failed:', error.response?.status, error.response?.data?.error || error.message);
    }

    console.log('─'.repeat(60));
  }

  console.log('\n🔧 TESTING TOOL CALLING WITH FREE LM STUDIO COMBOS\n');

  const toolPrompt = 'Create a function that calculates factorial and test it by running: factorial(5)';

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

  for (let i = 0; i < freeCombos.length; i++) {
    const combo = freeCombos[i];
    console.log(`🔧 TOOL TEST ${i + 1}: ${combo.name}`);

    try {
      const response = await axios.post('http://localhost:3001/v1/chat/completions', {
        messages: [{ role: 'user', content: toolPrompt }],
        model: combo.mainModelId, // Use main model, dual-mode will route to executor
        tools: tools,
        tool_choice: 'auto',
        temperature: 0.1
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      });

      console.log('✅ Tool response received');
      if (response.data.choices && response.data.choices[0]) {
        const choice = response.data.choices[0];
        console.log(`Finish reason: ${choice.finish_reason}`);

        if (choice.message.tool_calls) {
          console.log(`✅ TOOL CALLS: ${choice.message.tool_calls.length}`);
          choice.message.tool_calls.forEach((call, idx) => {
            console.log(`  ${idx + 1}. ${call.function.name}: ${call.function.arguments}`);
          });
        } else {
          console.log('❌ No tool calls made');
          console.log(`Response: ${choice.message.content?.substring(0, 100)}...`);
        }
      }

    } catch (error) {
      console.log('❌ Tool test failed:', error.response?.status, error.response?.data?.message || error.message);
    }

    console.log('─'.repeat(60));
  }
}

testFreeCombosOnly();

