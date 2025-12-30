import axios from 'axios';

async function testHybridIntent() {
  console.log('Testing OpenRouter (Main) + LM Studio (Executor) hybrid...');

  const mainModelId = 'allenai/olmo-3.1-32b-think';
  const executorModelId = 'qwen/qwen2.5-coder-32b-instruct';

  console.log(`Main model: ${mainModelId}`);
  console.log(`Executor model: ${executorModelId}`);
  console.log(`Main starts with allenai/: ${mainModelId.startsWith('allenai/')}`);
  console.log(`Executor starts with lmstudio/: ${executorModelId.startsWith('lmstudio/')}`);

  try {
    // Test with OpenRouter as Main and LM Studio as Executor
    const response = await axios.post('http://localhost:3001/api/tooly/combo-test/quick', {
      mainModelId, // OpenRouter
      executorModelId, // LM Studio
      contextSize: 4096
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('Hybrid test result:');
    console.log(JSON.stringify(response.data, null, 2));

    // Check if tool calls were generated
    if (response.data.result && response.data.result.testResults) {
      const toolCallResults = response.data.result.testResults.filter(r => r.expectedToolCall);
      console.log('\nTool call test results:');
      toolCallResults.forEach(result => {
        console.log(`Test: ${result.testName}`);
        console.log(`Expected tool: ${result.expectedToolCall}`);
        console.log(`Passed: ${result.passed}`);
        console.log(`Response: ${result.response?.substring(0, 200)}...`);
        console.log('---');
      });
    }
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testHybridIntent();
