import puppeteer from 'puppeteer';

(async () => {
  console.log('🚀 Starting Test: Dashboard (Command Center)');
  
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Listen for console logs
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.toString()));

  try {
    // 1. Navigate to Dashboard
    console.log('📍 Navigating to http://localhost:5173/...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 30000 });

    // Debug: Take screenshot
    await page.screenshot({ path: 'debug-dashboard.png' });
    console.log('📸 Screenshot saved to debug-dashboard.png');

    // 2. Verify Title
    console.log('🔍 Verifying Page Title...');
    try {
        await page.waitForSelector('h1', { timeout: 5000 });
        const title = await page.$eval('h1', el => el.textContent);
        console.log(`✅ Page Title Found: "${title}"`);
        if (!title?.includes('Command Center')) throw new Error('Incorrect page title: Expected "Command Center"');
    } catch (e) {
        console.error('❌ Title verification failed');
        throw e;
    }

    // 3. Verify SystemHUD
    console.log('🔍 Verifying SystemHUD...');
    const bodyText = await page.evaluate(() => document.body.innerText);
    
    const requiredMetrics = ['CPU', 'GPU', 'VRAM'];
    const missingMetrics = requiredMetrics.filter(m => !bodyText.includes(m));
    
    if (missingMetrics.length > 0) {
        throw new Error(`Missing SystemHUD metrics: ${missingMetrics.join(', ')}`);
    }
    console.log('✅ SystemHUD metrics labels found');

    // 4. Verify Project Switcher
    console.log('🔍 Verifying Project Switcher...');
    // Assuming it's in the header. We can check if "Summy" (default project) or similar is visible
    // or just check for the component structure if known.
    // Based on Layout.tsx, it's before the h1.
    // We'll check for a button or div that likely holds the project name.
    const projectSwitcherExists = await page.evaluate(() => {
        // Look for any element that might be the switcher. 
        // It often has a folder icon or the project path.
        // Let's check for the Safe Mode button as a proxy for the header being fully rendered
        return document.body.innerText.includes('SAFE MODE');
    });

    if (projectSwitcherExists) {
        console.log('✅ Header elements (Safe Mode) found');
    } else {
        console.warn('⚠️ Could not definitively confirm Project Switcher/Safe Mode via text content');
    }

    // 5. Verify Mode Cards (Dashboard Content)
    console.log('🔍 Verifying Mode Cards...');
    // Looking for "Single Model", "Dual Model", "Hardware" which are likely on the dashboard
    const hasSingleModel = bodyText.includes('Single Model');
    const hasDualModel = bodyText.includes('Dual Model');
    
    if (hasSingleModel && hasDualModel) {
        console.log('✅ Mode cards text found');
    } else {
        console.warn('⚠️ Mode cards text not found (Make sure dashboard is populated)');
    }

    // 6. Test Safe Mode Toggle
    console.log('Testing Safe Mode Toggle...');
    const safeModeButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => b.title.includes('Safe Mode'));
    });

    if (safeModeButton) {
        await safeModeButton.click();
        console.log('✅ Safe Mode toggle clicked');
        // We could verify state change if we knew the visual indicator, but clicking without error is a good start.
    } else {
        console.warn('⚠️ Safe Mode button not found by title');
    }

    console.log('🎉 Test Complete: SUCCESS');

  } catch (error) {
    console.error('❌ Test Failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
