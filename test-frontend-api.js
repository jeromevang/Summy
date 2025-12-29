import axios from 'axios';

async function testFrontendAPI() {
  try {
    console.log('Testing frontend API call...');
    const response = await axios.get('http://localhost:3001/api/tooly/models?provider=all');
    console.log('Frontend API Response:');
    console.log('Providers:', response.data.providers);
    console.log('Models count:', response.data.models.length);
    console.log('OpenRouter models:', response.data.models.filter(m => m.provider === 'openrouter').length);
    
    // Test with different provider filters
    console.log('\nTesting with OpenRouter filter...');
    const openrouterResponse = await axios.get('http://localhost:3001/api/tooly/models?provider=openrouter');
    console.log('OpenRouter API Response:');
    console.log('Providers:', openrouterResponse.data.providers);
    console.log('Models count:', openrouterResponse.data.models.length);
    console.log('OpenRouter models:', openrouterResponse.data.models.filter(m => m.provider === 'openrouter').length);
  } catch (error) {
    console.error('Frontend API Error:', error.message);
  }
}

testFrontendAPI();