/**
 * Test New Combo Failure Classification
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3001';

async function testNewComboFailureClassification() {
  console.log('🧪 Testing New Combo Failure Classification...\n');

  // Test 1: Log a new combo failure with qualifying gate error
  console.log('Test 1: Log new combo failure with qualifying gate error');
  try {
    const testFailure = {
      modelId: 'test-main-model',
      executorModelId: 'test-executor-model',
      category: 'combo_pairing',
      error: 'Combo Qualifying Gate failed at CQG-1: Format Compatibility',
      query: 'Combo testing: test-main-model-test-executor-model',
      expectedBehavior: 'Models should be compatible',
      actualBehavior: 'Format incompatibility detected',
      conversationLength: 1
    };

    const response = await axios.post(`${BASE_URL}/api/tooly/failures`, testFailure);
    console.log('✅ New combo failure logged successfully:', response.status);
  } catch (error) {
    console.log('❌ Failed to log new combo failure:', error.response?.status, error.response?.data);
  }

  // Test 2: Log a combo failure with main timeout error
  console.log('\nTest 2: Log combo failure with main timeout error');
  try {
    const testFailure = {
      modelId: 'slow-main-model',
      executorModelId: 'fast-executor-model',
      category: 'combo_pairing',
      error: 'Main model timeout during intent generation',
      query: 'Combo testing: slow-main-model-fast-executor-model',
      expectedBehavior: 'Main model should respond within timeout',
      actualBehavior: 'Main model too slow, combo excluded',
      conversationLength: 1
    };

    const response = await axios.post(`${BASE_URL}/api/tooly/failures`, testFailure);
    console.log('✅ Main timeout combo failure logged successfully:', response.status);
  } catch (error) {
    console.log('❌ Failed to log main timeout combo failure:', error.response?.status, error.response?.data);
  }

  // Test 3: Check if patterns are now detected
  console.log('\nTest 3: Check if combo patterns are now detected');
  try {
    const response = await axios.get(`${BASE_URL}/api/tooly/failures/patterns`);
    console.log('✅ Failure patterns endpoint accessible:', response.status);
    
    if (response.data.patterns) {
      const comboPatterns = Object.values(response.data.patterns).filter((p) => 
        p.id.includes('COMBO') || p.name.toLowerCase().includes('combo')
      );
      console.log('   Combo-specific patterns found:', comboPatterns.length);
      comboPatterns.forEach((pattern) => {
        console.log('     -', pattern.id, ':', pattern.name);
      });
    }
  } catch (error) {
    console.log('❌ Failure patterns endpoint failed:', error.response?.status);
  }

  // Test 4: Check the newly logged failures
  console.log('\nTest 4: Check newly logged combo failures');
  try {
    const response = await axios.get(`${BASE_URL}/api/tooly/failures?category=combo_pairing&limit=5`);
    console.log('✅ Combo failure endpoint accessible:', response.status);
    
    if (response.data.failures) {
      console.log('   Recent combo failures:', response.data.failures.length);
      response.data.failures.forEach((failure, index) => {
        console.log(`     ${index + 1}. ${failure.modelId} + ${failure.executorModelId}`);
        console.log(`        Error: ${failure.error}`);
        console.log(`        Error Type: ${failure.errorType}`);
        console.log(`        Pattern: ${failure.pattern || 'None'}`);
      });
    }
  } catch (error) {
    console.log('❌ Combo failure endpoint failed:', error.response?.status);
  }

  console.log('\n✅ New combo failure classification tests completed!');
}

testNewComboFailureClassification().catch(console.error);
