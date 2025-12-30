require('dotenv').config({ path: './server/.env' });
const axios = require('axios');

async function testOpenRouter() {
  try {
    console.log('Testing OpenRouter API connection...');
    console.log('OPENROUTER_API_KEY present:', !!process.env.OPENROUTER_API_KEY);
    console.log('API Key starts with:', process.env.OPENROUTER_API_KEY?.substring(0, 20) + '...');

    if (!process.env.OPENROUTER_API_KEY) {
      console.log('❌ No API key found. Please check server/.env file');
      return;
    }

    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY || 'NO_KEY'}`,
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Summy AI Platform'
      },
      timeout: 10000
    });

    console.log('✅ OpenRouter API connected successfully');
    console.log('Found', response.data?.data?.length || 0, 'models');

    // Check all models and their properties
    const allModels = response.data?.data || [];
    console.log('Total models:', allModels.length);

    // Filter for free models
    const freeModels = allModels.filter(m =>
      m.pricing?.prompt === "0" && m.pricing?.completion === "0"
    ) || [];

    console.log('Free models:', freeModels.length);

    // Filter for tool-capable models
    const toolModels = allModels.filter(m =>
      m.capabilities?.includes('tools')
    ) || [];

    console.log('Tool-capable models:', toolModels.length);

    // Filter for free AND tool-capable
    const freeToolModels = allModels.filter(m =>
      m.pricing?.prompt === "0" && m.pricing?.completion === "0" &&
      m.capabilities?.includes('tools')
    ) || [];

    console.log('Free tool-capable models:', freeToolModels.length);

    if (freeModels.length > 0) {
      console.log('Sample free models:');
      freeModels.slice(0, 3).forEach(m => {
        console.log(`  - ${m.id}: ${m.name}`);
        console.log(`    Capabilities: ${JSON.stringify(m.capabilities)}`);
        console.log(`    Pricing: ${JSON.stringify(m.pricing)}`);
      });
    }

    if (toolModels.length > 0) {
      console.log('Sample tool-capable models:');
      toolModels.slice(0, 3).forEach(m => console.log(`  - ${m.id}: ${m.name} (free: ${m.pricing?.prompt === "0" && m.pricing?.completion === "0"})`));
    }

    // Test a simple completion with the first free model
    if (freeModels.length > 0) {
      console.log('\nTesting simple completion...');
      const testModel = freeModels[0].id;
      console.log('Using model:', testModel);

      const completionResponse = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: testModel,
        messages: [{ role: 'user', content: 'Hello, respond with just: Hello from OpenRouter!' }],
        max_tokens: 50
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Summy AI Platform'
        },
        timeout: 30000
      });

      console.log('✅ Completion test successful');
      console.log('Model used:', testModel);
      console.log('Response:', completionResponse.data.choices[0].message.content);
    }

  } catch (error) {
    console.log('❌ OpenRouter API test failed:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', error.response.data);
    }
  }
}

testOpenRouter();
