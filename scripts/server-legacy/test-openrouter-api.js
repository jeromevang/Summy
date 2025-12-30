import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function testOpenRouterAPI() {
  console.log('Testing OpenRouter API directly...');

  try {
    // Check .env file directly (go up one directory from server/server to server)
    const envPath = path.join(process.cwd(), '..', '.env');
    console.log('Current working directory:', process.cwd());
    console.log('Checking .env file at:', envPath);
    console.log('File exists:', fs.existsSync(envPath));

    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const openrouterKey = envContent.split('\n')
        .find(line => line.startsWith('OPENROUTER_API_KEY='))
        ?.split('=')[1];

      console.log('OpenRouter API key present:', !!openrouterKey);
      console.log('API key starts with:', openrouterKey?.substring(0, 10) + '...');

      if (!openrouterKey) {
        console.error('No OpenRouter API key found in .env!');
        return;
      }
    } else {
      console.error('.env file not found!');
      return;
    }

    const envContent = fs.readFileSync(envPath, 'utf8');
    const openrouterKey = envContent.split('\n')
      .find(line => line.startsWith('OPENROUTER_API_KEY='))
      ?.split('=')[1];

    console.log('Found API key:', !!openrouterKey);

    // First test models endpoint
    console.log('Testing models endpoint...');
    let testModel = 'allenai/olmo-3.1-32b-think';

    try {
      const modelsResponse = await axios.get('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Summy AI Platform'
        },
        timeout: 10000
      });

      console.log('✅ Models endpoint works!');
      console.log('Number of models:', modelsResponse.data?.data?.length || 0);

      // Check if our test model exists
      const modelExists = modelsResponse.data?.data?.some(m => m.id === testModel);
      console.log(`Test model ${testModel} exists:`, modelExists);

      if (!modelExists) {
        console.log('Available free models:');
        const freeModels = modelsResponse.data?.data?.filter(m =>
          m.pricing?.prompt === "0" && m.pricing?.completion === "0"
        ) || [];
        freeModels.slice(0, 5).forEach(m => console.log(`  - ${m.id}: ${m.name}`));

        // Use first available free model
        if (freeModels.length > 0) {
          console.log(`Using first available free model: ${freeModels[0].id}`);
          testModel = freeModels[0].id;
        }
      }

    } catch (modelsError) {
      console.error('❌ Models endpoint failed:', modelsError.response?.status, modelsError.response?.data);
      return;
    }

    // Test the API directly with completion
    console.log(`Testing completion with model: ${testModel}`);
    try {
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: testModel,
        messages: [{ role: 'user', content: 'Hello, respond with just: OpenRouter test successful!' }],
        max_tokens: 50
      }, {
        headers: {
          'Authorization': `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Summy AI Platform'
        },
        timeout: 10000
      });

      console.log('✅ OpenRouter API call successful!');
      console.log('Response:', response.data.choices[0].message.content);
    } catch (completionError) {
      console.error('❌ Completion endpoint failed:', completionError.response?.status, completionError.response?.data);
    }

  } catch (error) {
    console.error('❌ OpenRouter API call failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Message:', error.message);
  }
}

testOpenRouterAPI();
