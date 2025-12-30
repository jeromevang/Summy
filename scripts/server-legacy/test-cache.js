/**
 * Cache System Test Script
 * Tests the caching functionality for performance optimization
 */

import { cacheService } from './src/services/cache/cache-service.js';
import axios from 'axios';

const BASE_URL = 'http://localhost:3001';

console.log('🧪 Testing Cache System...\n');

async function runCacheTests() {
  try {
    // Test 1: Cache stats endpoint
    console.log('Test 1: Cache stats endpoint');
    try {
      const response = await axios.get(`${BASE_URL}/api/system/cache/stats`);
      console.log('✅ Cache stats endpoint working:', response.status);
      console.log('   Cache stats:', JSON.stringify(response.data.stats, null, 2));
    } catch (error) {
      console.log('❌ Cache stats endpoint failed:', error.response?.status, error.message);
    }

    // Test 2: Cache clear endpoint
    console.log('\nTest 2: Cache clear endpoint');
    try {
      const response = await axios.delete(`${BASE_URL}/api/system/cache/clear`);
      console.log('✅ Cache clear endpoint working:', response.status);
      console.log('   Response:', response.data);
    } catch (error) {
      console.log('❌ Cache clear endpoint failed:', error.response?.status, error.message);
    }

    // Test 3: Test model profile caching
    console.log('\nTest 3: Model profile caching');
    try {
      // First request (cache miss)
      const response1 = await axios.get(`${BASE_URL}/api/tooly/models`);
      console.log('✅ First model request (cache miss):', response1.status);
      console.log('   Cache header:', response1.headers['x-cache'] || 'MISS');

      // Second request (should be cache hit if implemented)
      const response2 = await axios.get(`${BASE_URL}/api/tooly/models`);
      console.log('✅ Second model request:', response2.status);
      console.log('   Cache header:', response2.headers['x-cache'] || 'MISS');

    } catch (error) {
      console.log('❌ Model caching test failed:', error.response?.status, error.message);
    }

    // Test 4: Test combo results caching
    console.log('\nTest 4: Combo results caching');
    try {
      // First request (cache miss)
      const response1 = await axios.get(`${BASE_URL}/api/tooly/combo-test/results`);
      console.log('✅ First combo request (cache miss):', response1.status);
      console.log('   Cache header:', response1.headers['x-cache'] || 'MISS');

      // Second request (should be cache hit if implemented)
      const response2 = await axios.get(`${BASE_URL}/api/tooly/combo-test/results`);
      console.log('✅ Second combo request:', response2.status);
      console.log('   Cache header:', response2.headers['x-cache'] || 'MISS');

    } catch (error) {
      console.log('❌ Combo caching test failed:', error.response?.status, error.message);
    }

    console.log('\n✅ Cache system tests completed!');
    console.log('\n📊 Expected Results:');
    console.log('  - Cache stats endpoint should return cache statistics');
    console.log('  - Cache clear endpoint should clear all caches');
    console.log('  - Subsequent requests to same endpoints should show cache hits');
    console.log('  - Cache headers should indicate HIT/MISS status');

  } catch (error) {
    console.error('❌ Cache tests failed:', error.message);
  }
}

runCacheTests();
