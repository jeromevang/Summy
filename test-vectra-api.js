import { LocalIndex } from 'vectra';

async function testVectraAPI() {
  const index = new LocalIndex('./test-data');
  
  // Test the queryItems method signature
  try {
    // Try different argument combinations to understand the API
    console.log('Testing Vectra queryItems API...');
    
    // Test 1: Just vector and k
    console.log('Test 1: queryItems(vector, k)');
    const result1 = await index.queryItems([0.1, 0.2, 0.3], 5);
    console.log('Result 1:', result1);
  } catch (error) {
    console.log('Error in test 1:', error.message);
  }
  
  try {
    // Test 2: vector, k, and filter
    console.log('Test 2: queryItems(vector, k, filter)');
    const result2 = await index.queryItems([0.1, 0.2, 0.3], 5, null);
    console.log('Result 2:', result2);
  } catch (error) {
    console.log('Error in test 2:', error.message);
  }
  
  try {
    // Test 3: vector, k, filter, and limit
    console.log('Test 3: queryItems(vector, k, filter, limit)');
    const result3 = await index.queryItems([0.1, 0.2, 0.3], 5, null, 5);
    console.log('Result 3:', result3);
  } catch (error) {
    console.log('Error in test 3:', error.message);
  }
}

testVectraAPI().catch(console.error);
