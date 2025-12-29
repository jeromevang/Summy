import axios from 'axios';

async function testApiEndpoint() {
  console.log('Testing /api/tooly/models?provider=all endpoint...');

  try {
    const response = await axios.get('http://localhost:3001/api/tooly/models?provider=all');
    console.log('✅ API response:');
    console.log('Status:', response.status);
    console.log('Providers:', response.data.providers);
    console.log('Models count:', response.data.models?.length || 0);
    console.log('First few models:');
    (response.data.models || []).slice(0, 3).forEach(m => {
      console.log(`  - ${m.provider}: ${m.id}`);
    });
  } catch (error) {
    console.error('❌ API error:', error.response?.status, error.response?.data || error.message);
  }
}

testApiEndpoint();

