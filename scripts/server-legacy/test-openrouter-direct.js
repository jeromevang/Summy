import axios from 'axios';

async function testOpenRouterDirect() {
  console.log('Testing OpenRouter direct routing...');

  try {
    // Test a simple message route
    const response = await axios.post('http://localhost:3001/api/tooly/route', {
      messages: [{ role: 'user', content: 'Hello, respond with just: OpenRouter test successful!' }],
      tools: [],
      provider: 'openrouter',
      mainModelId: 'allenai/olmo-3.1-32b-think',
      executorModelId: 'allenai/olmo-3.1-32b-think'
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('Direct route response:');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.error('Direct route error:', error.response?.data || error.message);
    console.error('Status:', error.response?.status);
    if (error.response?.data?.error) {
      console.error('Error details:', error.response.data.error);
    }
  }
}

testOpenRouterDirect();

