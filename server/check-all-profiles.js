import axios from 'axios';

async function checkAllProfiles() {
  try {
    const profiles = await axios.get('http://localhost:3001/api/tooly/model-profiles');
    console.log('Available model profiles:');
    profiles.data.profiles.forEach(p => {
      console.log(`- ${p.id}: has systemPrompt: ${!!p.systemPrompt}`);
    });

    // Check if qwen/qwen3-4b-2507 exists
    const targetProfile = profiles.data.profiles.find(p => p.id === 'qwen/qwen3-4b-2507');
    if (targetProfile) {
      console.log('\nTarget model profile found:');
      console.log('System prompt length:', targetProfile.systemPrompt?.length || 0);
      if (targetProfile.systemPrompt) {
        console.log('System prompt preview:', targetProfile.systemPrompt.substring(0, 200) + '...');
      }
    } else {
      console.log('\n❌ Target model qwen/qwen3-4b-2507 has NO profile!');
    }

  } catch (error) {
    console.log('Error:', error.response?.data?.message || error.message);
  }
}

checkAllProfiles();

