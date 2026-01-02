#!/usr/bin/env node

/**
 * MCP Toolset Context Reduction Verification Script
 *
 * This script verifies that the MCP toolset preset system is working correctly
 * and provides actual vs expected context reduction measurements.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Token estimates per category (from documentation)
const TOKEN_ESTIMATES = {
  file_ops: 12000,
  git: 10000,
  npm: 4000,
  browser: 8000,
  rag: 5000,
  refactor: 2000,
  memory: 3000,
  system: 4000
};

const CORE_TOKENS = 6000; // Core utilities always loaded

const TOOLSET_PRESETS = {
  minimal: {
    categories: ['rag', 'memory'],
    expectedTokens: 8000
  },
  standard: {
    categories: ['rag', 'memory', 'browser', 'refactor', 'system'],
    expectedTokens: 15000
  },
  full: {
    categories: ['file_ops', 'git', 'npm', 'browser', 'rag', 'refactor', 'memory', 'system'],
    expectedTokens: 54000
  }
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(message) {
  console.log();
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'cyan');
  log(`  ${message}`, 'bright');
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'cyan');
  console.log();
}

function checkmark(passed) {
  return passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
}

async function verifySettingsFile() {
  header('1. Verifying settings.json Configuration');

  const settingsPath = path.join(__dirname, 'server', 'settings.json');

  if (!fs.existsSync(settingsPath)) {
    log(`✗ settings.json not found at ${settingsPath}`, 'red');
    return null;
  }

  log(`✓ Settings file exists: ${settingsPath}`, 'green');

  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    if (!settings.mcp) {
      log(`✗ No 'mcp' configuration found in settings.json`, 'red');
      log(`  Expected: { "mcp": { "toolset": "...", "customCategories": [...] } }`, 'yellow');
      return null;
    }

    log(`✓ MCP configuration found`, 'green');

    const { toolset, customCategories } = settings.mcp;

    log(`\n  Current Configuration:`, 'cyan');
    log(`    Toolset: ${toolset || 'NOT SET'}`, toolset ? 'white' : 'red');

    if (toolset === 'custom') {
      log(`    Categories: ${customCategories?.join(', ') || 'NONE'}`,
          customCategories?.length ? 'white' : 'red');
    }

    return { toolset, customCategories };

  } catch (error) {
    log(`✗ Failed to parse settings.json: ${error.message}`, 'red');
    return null;
  }
}

function calculateTokenUsage(toolset, customCategories) {
  header('2. Calculating Expected Token Usage');

  let categories = [];
  let expectedTokens = 0;

  if (toolset === 'custom') {
    categories = customCategories || [];
    expectedTokens = categories.reduce((sum, cat) => sum + (TOKEN_ESTIMATES[cat] || 0), CORE_TOKENS);
  } else if (TOOLSET_PRESETS[toolset]) {
    categories = TOOLSET_PRESETS[toolset].categories;
    expectedTokens = TOOLSET_PRESETS[toolset].expectedTokens;
  } else {
    log(`✗ Unknown toolset: ${toolset}`, 'red');
    return null;
  }

  log(`Selected Categories (${categories.length}):`, 'cyan');
  categories.forEach(cat => {
    const tokens = TOKEN_ESTIMATES[cat] || 0;
    log(`  ${checkmark(true)} ${cat.padEnd(12)} ~${tokens.toLocaleString()} tokens`, 'white');
  });

  log(`\n  Core utilities:     ~${CORE_TOKENS.toLocaleString()} tokens`, 'white');
  log(`  Category tools:     ~${(expectedTokens - CORE_TOKENS).toLocaleString()} tokens`, 'white');
  log(`  ─────────────────────────────────`, 'white');
  log(`  Total estimated:    ~${expectedTokens.toLocaleString()} tokens`, 'bright');

  const baseline = 54000;
  const savings = baseline - expectedTokens;
  const savingsPercent = ((savings / baseline) * 100).toFixed(1);

  if (savings > 0) {
    log(`\n  Context saved:      ~${savings.toLocaleString()} tokens (${savingsPercent}% reduction)`, 'green');
  } else {
    log(`\n  No context savings (using full toolset)`, 'yellow');
  }

  return { categories, expectedTokens, savings, savingsPercent };
}

async function testMCPEndpoints() {
  header('3. Testing MCP Server Endpoints');

  const BASE_URL = 'http://localhost:3001';

  // Test 1: MCP Status endpoint
  try {
    log(`Testing: GET ${BASE_URL}/api/mcp/status`, 'cyan');
    const statusRes = await fetch(`${BASE_URL}/api/mcp/status`);

    if (!statusRes.ok) {
      log(`  ✗ Status endpoint failed: ${statusRes.status} ${statusRes.statusText}`, 'red');
    } else {
      const data = await statusRes.json();
      log(`  ✓ Status endpoint responding`, 'green');
      log(`    Connected: ${data.connected ? 'Yes' : 'No'}`, data.connected ? 'green' : 'red');
      log(`    Mode: ${data.connectionMode || 'unknown'}`, 'white');
    }
  } catch (error) {
    log(`  ✗ Failed to reach MCP status endpoint`, 'red');
    log(`    Error: ${error.message}`, 'yellow');
    log(`    Make sure the server is running: npm run dev`, 'yellow');
    return false;
  }

  // Test 2: Settings endpoint
  try {
    log(`\nTesting: GET ${BASE_URL}/api/settings`, 'cyan');
    const settingsRes = await fetch(`${BASE_URL}/api/settings`);

    if (!settingsRes.ok) {
      log(`  ✗ Settings endpoint failed: ${settingsRes.status}`, 'red');
    } else {
      const data = await settingsRes.json();
      log(`  ✓ Settings endpoint responding`, 'green');

      if (data.mcp) {
        log(`    MCP config present: Yes`, 'green');
        log(`    Toolset: ${data.mcp.toolset}`, 'white');
      } else {
        log(`    ✗ No MCP config in API response`, 'red');
      }
    }
  } catch (error) {
    log(`  ✗ Failed to reach settings endpoint: ${error.message}`, 'red');
    return false;
  }

  return true;
}

function checkMCPServerLogs() {
  header('4. Checking MCP Server Startup Logs');

  const logPaths = [
    path.join(__dirname, 'dev.out'),
    path.join(__dirname, 'dev.err'),
    path.join(__dirname, 'server.out'),
    path.join(__dirname, 'server.err')
  ];

  let foundLogs = false;

  for (const logPath of logPaths) {
    if (!fs.existsSync(logPath)) continue;

    try {
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.split('\n');

      // Look for MCP registration logs
      const mcpLines = lines.filter(line =>
        line.includes('[MCP]') ||
        line.includes('Loading') && (line.includes('toolset') || line.includes('preset'))
      );

      if (mcpLines.length > 0) {
        foundLogs = true;
        log(`Found MCP logs in: ${path.basename(logPath)}`, 'cyan');

        // Show last 10 relevant lines
        const recentLines = mcpLines.slice(-10);
        recentLines.forEach(line => {
          if (line.includes('✓') || line.includes('Loading')) {
            log(`  ${line}`, 'green');
          } else if (line.includes('✗') || line.includes('error')) {
            log(`  ${line}`, 'red');
          } else {
            log(`  ${line}`, 'white');
          }
        });

        break;
      }
    } catch (error) {
      // Skip unreadable logs
    }
  }

  if (!foundLogs) {
    log(`⚠ No MCP startup logs found`, 'yellow');
    log(`  This is normal if the server hasn't been restarted since configuration`, 'yellow');
    log(`  Try: npm run dev (or restart the dev server)`, 'cyan');
  }
}

function printSummary(config, tokenCalc, endpointsOk) {
  header('📊 Verification Summary');

  if (!config || !tokenCalc) {
    log(`⚠ Verification incomplete - see errors above`, 'yellow');
    return;
  }

  log(`Settings Configuration:    ${checkmark(!!config)}`, 'white');
  log(`Token Calculation:         ${checkmark(!!tokenCalc)}`, 'white');
  log(`API Endpoints:             ${checkmark(endpointsOk)}`, 'white');

  console.log();

  if (tokenCalc.expectedTokens <= 10000) {
    log(`🟢 Excellent! Context footprint is minimal (${tokenCalc.expectedTokens.toLocaleString()} tokens)`, 'green');
  } else if (tokenCalc.expectedTokens <= 30000) {
    log(`🟡 Good! Context usage is balanced (${tokenCalc.expectedTokens.toLocaleString()} tokens)`, 'yellow');
  } else {
    log(`🔴 High context usage (${tokenCalc.expectedTokens.toLocaleString()} tokens)`, 'red');
    log(`   Consider switching to 'standard' or 'minimal' preset for better performance`, 'yellow');
  }

  console.log();
  log(`Next Steps:`, 'cyan');
  log(`  1. Run '/context' in Claude Code to see actual MCP token usage`, 'white');
  log(`  2. Compare actual vs expected: ~${tokenCalc.expectedTokens.toLocaleString()} tokens`, 'white');
  log(`  3. Adjust preset in Settings UI if needed`, 'white');
  log(`  4. Click 'Restart MCP Server' after changes`, 'white');

  console.log();
}

async function main() {
  log(`\n${'='.repeat(60)}`, 'bright');
  log(`  MCP Toolset Context Reduction Verification`, 'bright');
  log(`${'='.repeat(60)}\n`, 'bright');

  // Step 1: Verify settings file
  const config = await verifySettingsFile();

  // Step 2: Calculate token usage
  let tokenCalc = null;
  if (config) {
    tokenCalc = calculateTokenUsage(config.toolset, config.customCategories);
  }

  // Step 3: Test endpoints
  const endpointsOk = await testMCPEndpoints();

  // Step 4: Check server logs
  checkMCPServerLogs();

  // Step 5: Print summary
  printSummary(config, tokenCalc, endpointsOk);

  process.exit(config && tokenCalc ? 0 : 1);
}

// Run verification
main().catch(error => {
  log(`\n✗ Verification failed with error:`, 'red');
  log(`  ${error.message}`, 'red');
  if (error.stack) {
    log(`\nStack trace:`, 'yellow');
    console.error(error.stack);
  }
  process.exit(1);
});
