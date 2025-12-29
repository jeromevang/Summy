import axios from 'axios';

async function checkLMStudioModels() {
  console.log('Checking available LM Studio models (truly FREE):');

  try {
    const response = await axios.get('http://localhost:3001/api/tooly/models?provider=lmstudio');
    const models = response.data.models || [];

    console.log(`Found ${models.length} LM Studio models:`);
    models.slice(0, 10).forEach((m, i) => {
      console.log(`${i+1}. ${m.displayName} (${m.id})`);
    });

    if (models.length > 10) {
      console.log(`... and ${models.length - 10} more`);
    }

  } catch (error) {
    console.log('Error:', error.message);
  }
}

checkLMStudioModels();

