/**
 * Test if enhanced routes can be imported successfully
 */

console.log('Testing route imports...\n');

try {
  console.log('1. Importing teams-enhanced.ts...');
  const teams = await import('./src/routes/teams-enhanced.ts');
  console.log('   ✅ Teams routes:', teams.teamsEnhancedRouter ? 'OK' : 'MISSING');
} catch (e) {
  console.error('   ❌ Teams routes error:', e.message);
}

try {
  console.log('2. Importing workspace-enhanced.ts...');
  const workspace = await import('./src/routes/workspace-enhanced.ts');
  console.log('   ✅ Workspace routes:', workspace.workspaceEnhancedRouter ? 'OK' : 'MISSING');
} catch (e) {
  console.error('   ❌ Workspace routes error:', e.message);
}

try {
  console.log('3. Importing health.ts...');
  const health = await import('./src/routes/health.ts');
  console.log('   ✅ Health routes:', health.healthRouter ? 'OK' : 'MISSING');
} catch (e) {
  console.error('   ❌ Health routes error:', e.message);
}

try {
  console.log('4. Importing routes/index.ts...');
  const index = await import('./src/routes/index.ts');
  console.log('   ✅ Routes index exports:', Object.keys(index).join(', '));
} catch (e) {
  console.error('   ❌ Routes index error:', e.message);
  console.error('   Stack:', e.stack);
}

console.log('\nDone!');
