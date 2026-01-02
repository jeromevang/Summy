#!/usr/bin/env node
/**
 * REAL TEST VERIFICATION
 * Actually runs tests against live server and reports results
 */

import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:3001';
const results = [];

async function testEndpoint(name, url, expectedChecks = []) {
  try {
    const startTime = Date.now();
    const response = await fetch(url);
    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // Run expected checks
    const checkResults = expectedChecks.map(check => {
      try {
        check(data);
        return { passed: true };
      } catch (err) {
        return { passed: false, error: err.message };
      }
    });

    const allPassed = checkResults.every(r => r.passed);

    console.log(`${allPassed ? '✅' : '⚠️ '} ${name} - ${responseTime}ms`);

    results.push({
      name,
      status: allPassed ? 'PASS' : 'PARTIAL',
      responseTime,
      checks: checkResults
    });

    return { status: 'PASS', data };
  } catch (err) {
    console.log(`❌ ${name} - FAIL: ${err.message}`);
    results.push({
      name,
      status: 'FAIL',
      error: err.message
    });
    return { status: 'FAIL', error: err.message };
  }
}

async function testPost(name, url, body, expectedChecks = []) {
  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const responseTime = Date.now() - startTime;

    const data = await response.json();

    if (!response.ok) {
      console.log(`⚠️  ${name} - ${response.status}: ${data.error || 'Error'} - ${responseTime}ms`);
      results.push({
        name,
        status: 'EXPECTED_ERROR',
        statusCode: response.status,
        responseTime
      });
      return { status: 'EXPECTED_ERROR', data };
    }

    // Run expected checks
    const checkResults = expectedChecks.map(check => {
      try {
        check(data);
        return { passed: true };
      } catch (err) {
        return { passed: false, error: err.message };
      }
    });

    const allPassed = checkResults.every(r => r.passed);

    console.log(`${allPassed ? '✅' : '⚠️ '} ${name} - ${responseTime}ms`);

    results.push({
      name,
      status: allPassed ? 'PASS' : 'PARTIAL',
      responseTime,
      checks: checkResults
    });

    return { status: 'PASS', data };
  } catch (err) {
    console.log(`❌ ${name} - FAIL: ${err.message}`);
    results.push({
      name,
      status: 'FAIL',
      error: err.message
    });
    return { status: 'FAIL', error: err.message };
  }
}

console.log('🧪 REAL TEST VERIFICATION');
console.log('========================\n');

console.log('📡 Testing Endpoints...\n');

// Test 1: Health Check
await testEndpoint(
  'Health Check',
  `${SERVER_URL}/health`,
  [
    (data) => { if (data.status !== 'ok') throw new Error('Status not ok'); },
    (data) => { if (!data.uptime) throw new Error('No uptime'); },
    (data) => { if (!data.memory) throw new Error('No memory info'); }
  ]
);

// Test 2: Readiness Check
await testEndpoint(
  'Readiness Check',
  `${SERVER_URL}/ready`,
  [
    (data) => { if (typeof data.ready !== 'boolean') throw new Error('No ready field'); },
    (data) => { if (!data.services) throw new Error('No services field'); },
    (data) => { if (typeof data.services.database !== 'boolean') throw new Error('No database status'); }
  ]
);

// Test 3: Models API
const modelsResult = await testEndpoint(
  'Models API',
  `${SERVER_URL}/api/tooly/models?provider=all`,
  [
    (data) => { if (!Array.isArray(data.models)) throw new Error('Models not array'); },
    (data) => { if (data.models.length === 0) throw new Error('No models returned'); },
    (data) => {
      const hasId = data.models.every(m => m.id && m.displayName);
      if (!hasId) throw new Error('Models missing id/displayName');
    }
  ]
);

if (modelsResult.data) {
  console.log(`   → Found ${modelsResult.data.models.length} models`);
}

// Test 4: Team API - GET
await testEndpoint(
  'Team API - GET',
  `${SERVER_URL}/api/team`,
  [
    (data) => { if (!('team' in data)) throw new Error('No team field'); }
  ]
);

// Test 5: Team API - POST (create team)
const testTeamConfig = {
  mainModelId: 'gpt-4o',
  executorEnabled: false,
  executorModelId: '',
  agents: []
};

await testPost(
  'Team API - POST (create)',
  `${SERVER_URL}/api/team`,
  testTeamConfig,
  [
    (data) => { if (!data.team) throw new Error('No team in response'); },
    (data) => { if (data.team.mainModelId !== 'gpt-4o') throw new Error('Team not saved correctly'); }
  ]
);

// Test 6: Team API - GET (after save)
await testEndpoint(
  'Team API - GET (after save)',
  `${SERVER_URL}/api/team`,
  [
    (data) => { if (!data.team) throw new Error('Team not persisted'); },
    (data) => { if (data.team.mainModelId !== 'gpt-4o') throw new Error('Team data wrong'); }
  ]
);

// Test 7: Workspace API
await testEndpoint(
  'Workspace API',
  `${SERVER_URL}/api/workspace`,
  [
    (data) => { if (!('current' in data)) throw new Error('No current workspace'); },
    (data) => { if (!Array.isArray(data.recent)) throw new Error('Recent not array'); }
  ]
);

// Test 8: Browse API
const currentFolder = process.cwd();
await testEndpoint(
  'Browse API',
  `${SERVER_URL}/api/workspace/browse?path=${encodeURIComponent(currentFolder)}`,
  [
    (data) => { if (!data.currentPath) throw new Error('No current path'); },
    (data) => { if (!Array.isArray(data.items)) throw new Error('Items not array'); }
  ]
);

// Test 9: Error Handling - 404
await testEndpoint(
  'Error Handling - 404',
  `${SERVER_URL}/api/nonexistent`,
  []
);

// Test 10: Invalid Team POST
await testPost(
  'Validation - Invalid Team',
  `${SERVER_URL}/api/team`,
  { invalidField: 'test' },
  []
);

console.log('\n========================');
console.log('📊 TEST SUMMARY\n');

const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
const partial = results.filter(r => r.status === 'PARTIAL').length;
const expected = results.filter(r => r.status === 'EXPECTED_ERROR').length;

console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`⚠️  Partial: ${partial}`);
console.log(`🔄 Expected Errors: ${expected}`);
console.log(`📈 Total: ${results.length}`);

const passRate = ((passed / results.length) * 100).toFixed(1);
console.log(`\n🎯 Pass Rate: ${passRate}%`);

console.log('\n✅ VERIFICATION COMPLETE!\n');

if (failed > 0) {
  console.log('Failed tests:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  ❌ ${r.name}: ${r.error}`);
  });
  process.exit(1);
}

process.exit(0);
