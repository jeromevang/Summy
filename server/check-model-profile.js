import axios from 'axios';

async function checkModelProfile() {
  console.log('🔍 CHECKING MODEL PROFILE FOR SYSTEM PROMPT');

  try {
    // Get the model being used
    const settings = await axios.get('http://localhost:3001/api/settings');
    console.log('Current settings:', settings.data);

    let modelId;
    if (settings.data.provider === 'lmstudio') {
      modelId = settings.data.lmstudioModel;
    } else if (settings.data.provider === 'azure') {
      modelId = settings.data.azureDeploymentName;
    } else if (settings.data.provider === 'openrouter') {
      modelId = settings.data.mainModelId;
    } else {
      modelId = settings.data.openaiModel;
    }

    console.log('Model ID being used:', modelId);

    if (!modelId) {
      console.log('❌ No model ID found in settings');
      return;
    }

    // Get the model profile
    const profile = await axios.get(`http://localhost:3001/api/tooly/model-profile/${encodeURIComponent(modelId)}`);
    console.log('Model profile:');
    console.log('- Has systemPrompt:', !!profile.data.systemPrompt);
    console.log('- System prompt length:', profile.data.systemPrompt?.length || 0);
    if (profile.data.systemPrompt) {
      console.log('- System prompt preview:', profile.data.systemPrompt.substring(0, 200) + '...');
    } else {
      console.log('❌ NO SYSTEM PROMPT - That is why no enhancement!');
    }

  } catch (error) {
    console.log('Error:', error.response?.data?.message || error.message);
  }
}

checkModelProfile();
