/**
 * Test Combo Failure Logging Integration
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3001';

async function testComboFailureIntegration() {
  console.log('🧪 Testing Combo Failure Logging Integration...\n');

  // Test 1: Check if combo failures are being logged
  console.log('Test 1: Check combo failure log endpoint');
  try {
    const response = await axios.get(`${BASE_URL}/api/tooly/failures?category=combo_pairing`);
    console.log('✅ Combo failure endpoint accessible:', response.status);
    console.log('   Combo failures found:', response.data.failures?.length || 0);
    
    if (response.data.failures && response.data.failures.length > 0) {
      console.log('   Sample combo failure:', {
        modelId: response.data.failures[0].modelId,
        executorModelId: response.data.failures[0].executorModelId,
        error: response.data.failures[0].error,
        errorType: response.data.failures[0].errorType,
        pattern: response.data.failures[0].pattern
      });
    }
  } catch (error) {
    console.log('❌ Combo failure endpoint failed:', error.response?.status);
  }

  // Test 2: Check failure patterns
  console.log('\nTest 2: Check failure patterns endpoint');
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

  // Test 3: Check controller analysis endpoint
  console.log('\nTest 3: Check controller analysis endpoint');
  try {
    const response = await axios.get(`${BASE_URL}/api/tooly/controller/status`);
    console.log('✅ Controller status endpoint accessible:', response.status);
    
    if (response.data.summary) {
      console.log('   Total failures:', response.data.summary.stats?.totalFailures || 0);
      console.log('   Combo failures:', response.data.summary.stats?.failuresByCategory?.combo_pairing || 0);
      console.log('   Unresolved patterns:', response.data.summary.unresolvedPatterns?.length || 0);
    }
  } catch (error) {
    console.log('❌ Controller status endpoint failed:', error.response?.status);
  }

  // Test 4: Test logging a combo failure manually
  console.log('\nTest 4: Test manual combo failure logging');
  try {
    const testFailure = {
      modelId: 'test-main-model',
      executorModelId: 'test-executor-model',
      category: 'combo_pairing',
      error: 'Combo test scored only 25% (2/8 tests passed)',
      query: 'Combo testing: test-main-model-test-executor-model',
      expectedBehavior: 'Better model pairing performance',
      actualBehavior: 'Main: 30%, Executor: 20%, Overall: 25%',
      conversationLength: 1
    };

    const response = await axios.post(`${BASE_URL}/api/tooly/failures`, testFailure);
    console.log('✅ Manual combo failure logging successful:', response.status);
  } catch (error) {
    console.log('❌ Manual combo failure logging failed:', error.response?.status);
  }

  console.log('\n✅ Combo failure logging integration tests completed!');
}

testComboFailureIntegration().catch(console.error);
