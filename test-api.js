import axios from 'axios';

async function testApi() {
  try {
    console.log('Testing /api/tooly/models endpoint...');
    const response = await axios.get('http://localhost:3001/api/tooly/models');
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testApi();