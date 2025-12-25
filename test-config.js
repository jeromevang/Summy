const fs = require('fs-extra');
const path = require('path');

// Test loading the JSON config
const configPath = path.join(__dirname, 'server', 'data', 'agentic-readiness-suite.json');

try {
  const config = fs.readJsonSync(configPath);
  console.log('✅ Successfully loaded test suite config');
  console.log(`📊 Version: ${config.version}`);
  console.log(`🎯 Tests loaded: ${config.tests.length}`);
  console.log(`📈 Passing threshold: ${config.threshold}%`);

  console.log('\n📋 Category Weights:');
  Object.entries(config.categoryWeights).forEach(([cat, weight]) => {
    console.log(`  ${cat}: ${(weight * 100).toFixed(0)}%`);
  });

  console.log('\n🧪 Sample Tests:');
  config.tests.slice(0, 3).forEach(test => {
    console.log(`  ${test.id}: ${test.name} (${test.category})`);
  });

  console.log('\n✨ Configuration is working correctly!');
} catch (error) {
  console.error('❌ Failed to load config:', error.message);
  process.exit(1);
}




