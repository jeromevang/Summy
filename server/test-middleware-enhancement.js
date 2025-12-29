import axios from 'axios';

async function testWhatUserExpects() {
  console.log('🧪 TESTING WHAT SHOULD HAPPEN WITH REGULAR MESSAGES');
  console.log('The user expects the middleware to add value even without tools');

  const regularRequest = {
    messages: [{
      role: 'user',
      content: 'Explain what this project does'
    }],
    model: 'qwen/qwen2.5-coder-32b-instruct',
    temperature: 0.1
  };

  try {
    const start = Date.now();
    const response = await axios.post('http://localhost:3001/chat/completions', regularRequest);
    const end = Date.now();

    console.log('✅ Response time:', end - start + 'ms');
    console.log('Response preview:', response.data.choices[0].message.content?.substring(0, 200) + '...');

    // Check if it added any Summy-specific enhancements
    const content = response.data.choices[0].message.content;

    // Look for signs of middleware enhancement
    const hasContextMarkers = content?.includes('based on') || content?.includes('context');
    const hasLearningMarkers = content?.includes('learned') || content?.includes('improved');

    console.log('Has context enhancement:', hasContextMarkers);
    console.log('Has learning enhancement:', hasLearningMarkers);

    if (!hasContextMarkers && !hasLearningMarkers) {
      console.log('❌ NO MIDDLEWARE ENHANCEMENT - Just plain LLM response');
      console.log('This is why "nothing happens" - middleware not adding value to regular chat');
    }

  } catch (error) {
    console.log('Error:', error.message);
  }
}

testWhatUserExpects();

