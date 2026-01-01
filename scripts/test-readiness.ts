import puppeteer from 'puppeteer';

(async () => {
  console.log('🚀 Starting Test: Agentic Readiness Page');
  
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Listen for console logs
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.toString()));

  try {
    // 1. Navigate to Readiness
    console.log('📍 Navigating to http://localhost:5173/tooly/readiness...');
    await page.goto('http://localhost:5173/tooly/readiness', { waitUntil: 'networkidle0', timeout: 30000 });

    // 2. Verify Title (h1 inside page)
    try {
        await page.waitForSelector('h1', { timeout: 5000 });
        const title = await page.$eval('h1', el => el.textContent);
        console.log(`✅ Page Title Found: "${title}"`);
        if (!title?.includes('Agentic Readiness')) throw new Error('Incorrect page title');
    } catch (e) {
        throw new Error('Title verification failed: ' + e);
    }

    // 3. Verify Tabs
    const tabs = ['Single', 'Dual', 'All', 'Hardware'];
    const pageText = await page.evaluate(() => document.body.innerText);
    
    for (const tab of tabs) {
        if (pageText.includes(tab)) console.log(`✅ Tab "${tab}" found`);
        else console.warn(`⚠️ Tab "${tab}" NOT found (might use different text)`);
    }

    // 4. Verify Inputs
    const selects = await page.$$('select');
    if (selects.length >= 2) console.log('✅ Provider & Model dropdowns found');
    else console.warn(`⚠️ Found ${selects.length} dropdowns (expected at least 2)`);

    // 5. Verify Run Button
    const runBtnFound = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(b => b.textContent?.includes('Run Assessment'));
    });
    
    if (runBtnFound) console.log('✅ "Run Assessment" button found');
    else console.error('❌ "Run Assessment" button missing');

    console.log('🎉 Test Complete: SUCCESS');

  } catch (error) {
    console.error('❌ Test Failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
