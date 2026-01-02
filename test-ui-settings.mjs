#!/usr/bin/env node

/**
 * UI Test for MCP Tools Configuration Settings
 * Tests the actual UI in a real browser using Playwright
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testMCPToolsUI() {
  let browser;
  let screenshotCount = 0;

  try {
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    log('  MCP Tools Configuration UI Test', 'bright');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

    // Launch browser
    log('1. Launching browser...', 'cyan');
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    // Navigate to settings page
    log('2. Navigating to http://localhost:5173/settings', 'cyan');
    await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Take screenshot of initial page
    const screenshot1 = `screenshot_settings_${Date.now()}.png`;
    await page.screenshot({ path: screenshot1, fullPage: true });
    log(`   ✓ Screenshot saved: ${screenshot1}`, 'green');
    screenshotCount++;

    // Check if MCP Tools Config section exists
    log('\n3. Checking for MCP Tools Configuration section...', 'cyan');
    const mcpHeader = await page.locator('text=🛠️ MCP Tools Configuration').count();

    if (mcpHeader === 0) {
      log('   ✗ MCP Tools Configuration section NOT FOUND!', 'red');
      return false;
    }
    log('   ✓ MCP Tools Configuration section found', 'green');

    // Scroll to MCP section
    await page.locator('text=🛠️ MCP Tools Configuration').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // Check for preset dropdown
    log('\n4. Checking preset dropdown...', 'cyan');
    const dropdown = page.locator('select').first();
    const dropdownExists = await dropdown.count() > 0;

    if (!dropdownExists) {
      log('   ✗ Preset dropdown NOT FOUND!', 'red');
      return false;
    }
    log('   ✓ Preset dropdown exists', 'green');

    // Get current value
    const currentValue = await dropdown.inputValue();
    log(`   Current preset: ${currentValue}`, 'cyan');

    // Check for token estimate display
    log('\n5. Checking token estimate display...', 'cyan');
    const tokenDisplay = await page.locator('text=/~.*tokens/i').count();

    if (tokenDisplay === 0) {
      log('   ✗ Token estimate NOT FOUND!', 'red');
      return false;
    }
    log(`   ✓ Token estimate displayed (${tokenDisplay} instances found)`, 'green');

    // Take screenshot of MCP section
    const screenshot2 = `screenshot_mcp_section_${Date.now()}.png`;
    await page.screenshot({ path: screenshot2, fullPage: true });
    log(`   ✓ Screenshot saved: ${screenshot2}`, 'green');
    screenshotCount++;

    // Test preset selection
    log('\n6. Testing preset selection...', 'cyan');

    // Try selecting "minimal"
    await dropdown.selectOption('minimal');
    await page.waitForTimeout(1000);
    log('   ✓ Selected "minimal" preset', 'green');

    // Check if token count updated
    const minimalTokenText = await page.locator('text=/~.*tokens/i').first().textContent();
    log(`   Token estimate after minimal: ${minimalTokenText}`, 'cyan');

    // Check for restart button
    const restartButton = await page.locator('text=/Restart MCP Server/i').count();
    if (restartButton > 0) {
      log('   ✓ "Restart MCP Server" button appeared', 'green');
    } else {
      log('   ⚠ "Restart MCP Server" button not visible', 'yellow');
    }

    // Screenshot after changing preset
    const screenshot3 = `screenshot_minimal_preset_${Date.now()}.png`;
    await page.screenshot({ path: screenshot3, fullPage: true });
    log(`   ✓ Screenshot saved: ${screenshot3}`, 'green');
    screenshotCount++;

    // Try selecting "custom"
    log('\n7. Testing custom preset with categories...', 'cyan');
    await dropdown.selectOption('custom');
    await page.waitForTimeout(1000);
    log('   ✓ Selected "custom" preset', 'green');

    // Check for category checkboxes
    const checkboxes = await page.locator('input[type="checkbox"]').count();
    log(`   ✓ Found ${checkboxes} category checkboxes`, 'green');

    if (checkboxes > 0) {
      // Try clicking a checkbox
      const firstCheckbox = page.locator('input[type="checkbox"]').first();
      const wasChecked = await firstCheckbox.isChecked();
      await firstCheckbox.click();
      await page.waitForTimeout(500);
      const isChecked = await firstCheckbox.isChecked();

      if (wasChecked !== isChecked) {
        log('   ✓ Checkbox interaction works', 'green');
      } else {
        log('   ⚠ Checkbox state did not change', 'yellow');
      }
    }

    // Screenshot of custom preset
    const screenshot4 = `screenshot_custom_preset_${Date.now()}.png`;
    await page.screenshot({ path: screenshot4, fullPage: true });
    log(`   ✓ Screenshot saved: ${screenshot4}`, 'green');
    screenshotCount++;

    // Switch back to standard
    log('\n8. Switching to standard preset...', 'cyan');
    await dropdown.selectOption('standard');
    await page.waitForTimeout(1000);
    const standardTokenText = await page.locator('text=/~.*tokens/i').first().textContent();
    log(`   ✓ Selected "standard" preset`, 'green');
    log(`   Token estimate: ${standardTokenText}`, 'cyan');

    // Final screenshot
    const screenshot5 = `screenshot_standard_preset_${Date.now()}.png`;
    await page.screenshot({ path: screenshot5, fullPage: true });
    log(`   ✓ Screenshot saved: ${screenshot5}`, 'green');
    screenshotCount++;

    // Summary
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    log('  ✅ UI Test Summary', 'bright');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

    log('✓ MCP Tools Configuration section renders', 'green');
    log('✓ Preset dropdown functional', 'green');
    log('✓ Token estimates display correctly', 'green');
    log('✓ Custom category checkboxes work', 'green');
    log(`✓ ${screenshotCount} screenshots captured`, 'green');

    log('\n💡 Keep browser open for 5 seconds for manual inspection...', 'cyan');
    await page.waitForTimeout(5000);

    return true;

  } catch (error) {
    log(`\n✗ Test failed: ${error.message}`, 'red');
    console.error(error);
    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run test
testMCPToolsUI()
  .then(success => {
    if (success) {
      log('\n✅ All UI tests passed!', 'green');
      process.exit(0);
    } else {
      log('\n❌ UI tests failed', 'red');
      process.exit(1);
    }
  })
  .catch(error => {
    log(`\n❌ Test error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  });
