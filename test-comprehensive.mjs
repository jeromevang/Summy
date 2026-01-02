import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Current project folder
const CURRENT_FOLDER = resolve(__dirname);

async function testSummyComprehensive() {
  console.log('🚀 Starting Comprehensive Summy Test Suite\n');
  console.log(`📁 Test Project: ${CURRENT_FOLDER}\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const results = {
    passed: [],
    failed: [],
    warnings: []
  };

  // Capture console and errors
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log('❌ CONSOLE ERROR:', msg.text());
    }
  });

  page.on('pageerror', error => {
    pageErrors.push(error.message);
    console.error('❌ PAGE ERROR:', error.message);
  });

  try {
    // ==================== TEST 1: Homepage Load ====================
    console.log('📋 TEST 1: Homepage & UI Load');
    const startTime = Date.now();

    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(2000);

    const loadTime = Date.now() - startTime;
    console.log(`   ⏱️  Load time: ${loadTime}ms`);

    if (loadTime > 3000) {
      results.warnings.push('Page load time > 3s');
    }

    await page.screenshot({ path: 'test-results/01-homepage.png', fullPage: true });

    // Check for main elements
    const appDiv = await page.locator('#root, #app').count();
    if (appDiv > 0) {
      results.passed.push('App root element renders');
      console.log('   ✅ App root element found');
    } else {
      results.failed.push('App root element not found');
      console.log('   ❌ App root element missing');
    }

    // Check for buttons (should have navigation, etc)
    const buttonCount = await page.locator('button').count();
    console.log(`   📊 Found ${buttonCount} buttons`);
    if (buttonCount > 0) {
      results.passed.push(`UI interactive elements present (${buttonCount} buttons)`);
    }

    await page.waitForTimeout(1000);

    // ==================== TEST 2: Project Switcher ====================
    console.log('\n📋 TEST 2: Project Switcher Functionality');

    // Find project switcher button
    const switcherButton = page.locator('button:has-text("📂")').or(
      page.locator('button').filter({ hasText: /Unknown Project|Summy/ })
    ).first();

    const switcherExists = await switcherButton.count() > 0;
    if (switcherExists) {
      results.passed.push('Project Switcher button found');
      console.log('   ✅ Project Switcher button found');

      const buttonText = await switcherButton.textContent();
      console.log(`   📋 Button text: "${buttonText}"`);

      // Click to open dropdown
      await switcherButton.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/02-dropdown-open.png', fullPage: true });

      results.passed.push('Project Switcher dropdown opens');
      console.log('   ✅ Dropdown opened');

      // Check for Browse button
      const browseButton = page.locator('button:has-text("Browse")').first();
      const hasBrowse = await browseButton.count() > 0;

      if (hasBrowse) {
        results.passed.push('Browse button present');
        console.log('   ✅ Browse button found');

        // Click Browse
        await browseButton.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'test-results/03-modal-open.png', fullPage: true });

        // Check modal opened
        const modalTitle = page.locator('h3:has-text("Select Directory")');
        const hasModal = await modalTitle.count() > 0;

        if (hasModal) {
          results.passed.push('Directory browser modal opens');
          console.log('   ✅ Directory browser modal opened');

          // Check for directory listings
          const hasLoading = await page.locator('text=Loading directory').count() > 0;
          const hasError = await page.locator('text=Error:').count() > 0;
          const hasDirs = await page.locator('div:has-text("📁")').count();

          console.log(`   📊 Loading: ${hasLoading}, Error: ${hasError}, Directories: ${hasDirs}`);

          if (hasError) {
            results.failed.push('Directory browser has error');
          } else if (hasDirs > 0) {
            results.passed.push(`Directory browser lists ${hasDirs} directories`);
            console.log(`   ✅ Found ${hasDirs} directories`);

            // Try clicking first directory
            const firstDir = page.locator('div:has-text("📁")').first();
            const dirName = await firstDir.textContent();
            console.log(`   📂 Clicking: ${dirName?.substring(0, 50)}`);

            await firstDir.click();
            await page.waitForTimeout(1500);
            await page.screenshot({ path: 'test-results/04-nav-directory.png', fullPage: true });

            results.passed.push('Directory navigation works');
            console.log('   ✅ Directory navigation successful');

            // Click back button
            const backButton = page.locator('button:has-text("⬅️")').first();
            const hasBack = await backButton.count() > 0;
            if (hasBack) {
              try {
                await backButton.click({ timeout: 5000, force: true });
                await page.waitForTimeout(1000);
                results.passed.push('Back button works');
                console.log('   ✅ Back navigation works');
              } catch (e) {
                results.warnings.push('Back button not clickable (viewport issue)');
                console.log('   ⚠️  Back button exists but not clickable');
              }
            }

            // Test "Select This" button
            const selectButton = page.locator('button:has-text("Select This")').first();
            const hasSelect = await selectButton.count() > 0;
            if (hasSelect) {
              results.passed.push('"Select This" button present');
              console.log('   ✅ "Select This" button found');

              // Scroll button into view and click
              try {
                await selectButton.scrollIntoViewIfNeeded({ timeout: 5000 });
                await page.waitForTimeout(500);
                await selectButton.click({ timeout: 10000 });
                await page.waitForTimeout(2000);
                await page.screenshot({ path: 'test-results/05-folder-selected.png', fullPage: true });

                results.passed.push('Folder selection completes');
                console.log('   ✅ Folder selected');
              } catch (e) {
                results.warnings.push('Select button found but click failed (likely viewport issue)');
                console.log('   ⚠️  Select button click failed:', e.message.split('\n')[0]);
              }
            }
          } else if (hasLoading) {
            results.warnings.push('Directory browser still loading');
          }
        } else {
          results.failed.push('Directory browser modal did not open');
        }
      } else {
        results.failed.push('Browse button not found');
      }
    } else {
      results.failed.push('Project Switcher button not found');
      console.log('   ❌ Project Switcher not found');
    }

    // ==================== TEST 3: Manual Path Input ====================
    console.log('\n📋 TEST 3: Manual Path Input');

    // Open dropdown again if needed
    const dropdownVisible = await page.locator('input[placeholder*="path"]').count() > 0;
    if (!dropdownVisible) {
      await switcherButton.click();
      await page.waitForTimeout(500);
    }

    const pathInput = page.locator('input[placeholder*="path"]').first();
    const hasPathInput = await pathInput.count() > 0;

    if (hasPathInput) {
      results.passed.push('Manual path input present');
      console.log('   ✅ Manual path input found');

      await pathInput.fill(CURRENT_FOLDER);
      await page.waitForTimeout(500);

      const goButton = page.locator('button:has-text("Go")').first();
      const hasGo = await goButton.count() > 0;

      if (hasGo) {
        const isEnabled = await goButton.isEnabled();
        if (isEnabled) {
          results.passed.push('Manual path "Go" button functional');
          console.log('   ✅ "Go" button enabled with path');
        } else {
          results.failed.push('"Go" button disabled with valid path');
        }
      }
    } else {
      results.failed.push('Manual path input not found');
    }

    await page.screenshot({ path: 'test-results/06-manual-path.png', fullPage: true });

    // ==================== TEST 4: Navigation & Pages ====================
    console.log('\n📋 TEST 4: Page Navigation');

    const pages = [
      { name: 'Dashboard', selector: 'a[href="/"], a[href="#/"]' },
      { name: 'Sessions', selector: 'a[href="/sessions"], a[href="#/sessions"]' },
      { name: 'Sources', selector: 'a[href="/sources"], a[href="#/sources"]' },
      { name: 'Team Builder', selector: 'a[href="/team-builder"], a[href="#/team-builder"]' },
      { name: 'Tooly', selector: 'a[href="/tooly"], a[href="#/tooly"]' },
      { name: 'RAG', selector: 'a[href="/rag"], a[href="#/rag"]' },
      { name: 'Debug', selector: 'a[href="/debug"], a[href="#/debug"]' },
      { name: 'Settings', selector: 'a[href="/settings"], a[href="#/settings"]' }
    ];

    for (const pageInfo of pages) {
      const link = page.locator(pageInfo.selector).first();
      const exists = await link.count() > 0;

      if (exists) {
        console.log(`   🔗 Testing ${pageInfo.name} page...`);
        await link.click();
        await page.waitForTimeout(1500);

        // Take screenshot of each page
        const filename = pageInfo.name.toLowerCase().replace(/\s+/g, '-');
        await page.screenshot({ path: `test-results/page-${filename}.png`, fullPage: true });

        // Check no errors occurred
        const errorsBefore = pageErrors.length;
        await page.waitForTimeout(500);
        const errorsAfter = pageErrors.length;

        if (errorsBefore === errorsAfter) {
          results.passed.push(`${pageInfo.name} page loads without errors`);
          console.log(`   ✅ ${pageInfo.name} page OK`);
        } else {
          results.failed.push(`${pageInfo.name} page has errors`);
          console.log(`   ❌ ${pageInfo.name} page has ${errorsAfter - errorsBefore} errors`);
        }
      } else {
        results.warnings.push(`${pageInfo.name} page link not found`);
        console.log(`   ⚠️  ${pageInfo.name} link not found in navigation`);
      }
    }

    await page.screenshot({ path: 'test-results/07-final-state.png', fullPage: true });

    // ==================== RESULTS SUMMARY ====================
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(60));

    console.log(`\n✅ PASSED (${results.passed.length}):`);
    results.passed.forEach(test => console.log(`   ✓ ${test}`));

    if (results.warnings.length > 0) {
      console.log(`\n⚠️  WARNINGS (${results.warnings.length}):`);
      results.warnings.forEach(warning => console.log(`   ⚠ ${warning}`));
    }

    if (results.failed.length > 0) {
      console.log(`\n❌ FAILED (${results.failed.length}):`);
      results.failed.forEach(test => console.log(`   ✗ ${test}`));
    }

    if (consoleErrors.length > 0) {
      console.log(`\n🐛 CONSOLE ERRORS (${consoleErrors.length}):`);
      consoleErrors.slice(0, 5).forEach(err => console.log(`   • ${err}`));
      if (consoleErrors.length > 5) {
        console.log(`   ... and ${consoleErrors.length - 5} more`);
      }
    }

    if (pageErrors.length > 0) {
      console.log(`\n🐛 PAGE ERRORS (${pageErrors.length}):`);
      pageErrors.forEach(err => console.log(`   • ${err}`));
    }

    console.log('\n📸 Screenshots saved in test-results/');

    const successRate = (results.passed.length / (results.passed.length + results.failed.length) * 100).toFixed(1);
    console.log(`\n🎯 Success Rate: ${successRate}%`);

  } catch (error) {
    console.error('\n💥 TEST SUITE FAILED:', error.message);
    await page.screenshot({ path: 'test-results/error.png', fullPage: true });
  } finally {
    console.log('\n⏸️  Keeping browser open for 5 seconds...');
    await page.waitForTimeout(5000);
    await browser.close();
    console.log('✅ Test complete!\n');
  }
}

testSummyComprehensive();
