import axios from 'axios';

async function checkAvailableModels() {
  console.log('Checking what models are actually available...');

  try {
    const response = await axios.get('http://localhost:3001/api/tooly/models');
    console.log('Available models by provider:');

    const providers = response.data.providers;
    console.log('Providers status:', providers);

    const models = response.data.models || [];
    console.log('Total models:', models.length);

    // Group by provider
    const byProvider = {};
    models.forEach(model => {
      if (!byProvider[model.provider]) byProvider[model.provider] = [];
      byProvider[model.provider].push(model.id);
    });

    Object.keys(byProvider).forEach(provider => {
      console.log(`${provider.toUpperCase()} (${byProvider[provider].length} models):`);
      byProvider[provider].slice(0, 3).forEach(id => console.log(`  - ${id}`));
      if (byProvider[provider].length > 3) console.log(`  ... and ${byProvider[provider].length - 3} more`);
    });

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

checkAvailableModels();

