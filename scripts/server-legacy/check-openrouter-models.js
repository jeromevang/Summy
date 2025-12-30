import axios from 'axios';
import 'dotenv/config';

async function checkOpenRouterModels() {
  try {
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const models = response.data.data.filter(m =>
      m.id.includes('qwen') && m.pricing?.prompt === "0" && m.pricing?.completion === "0"
    );

    console.log('Available FREE Qwen models on OpenRouter:');
    models.forEach(m => {
      console.log(`- ${m.id}: ${m.name}`);
    });

    // Check if the configured model exists
    const targetModel = response.data.data.find(m => m.id === 'qwen/qwen3-4b-2507');
    console.log('\nTarget model qwen/qwen3-4b-2507 exists:', !!targetModel);

  } catch (error) {
    console.log('Error:', error.message);
  }
}

checkOpenRouterModels();

