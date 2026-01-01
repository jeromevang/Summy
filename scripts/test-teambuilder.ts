import puppeteer from 'puppeteer';

(async () => {
  console.log('🚀 Starting Test: Team Builder Page');
  
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Listen for console logs
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.toString()));

  try {
    // 1. Navigate to Team Builder
    console.log('📍 Navigating to http://localhost:5173/team-builder...');
    await page.goto('http://localhost:5173/team-builder', { waitUntil: 'networkidle0', timeout: 30000 });

    // 2. Verify Title
    try {
        await page.waitForSelector('h1', { timeout: 5000 });
        const title = await page.$eval('h1', el => el.textContent);
        console.log(`✅ Page Title Found: "${title}"`);
        if (!title?.includes('Team Builder')) throw new Error('Incorrect page title');
    } catch (e) {
        throw new Error('Title verification failed: ' + e);
    }

    // 3. Verify Sections
    const bodyText = await page.evaluate(() => document.body.innerText);
    
    if (bodyText.includes('Main Architect')) console.log('✅ "Main Architect" section found');
    else console.error('❌ "Main Architect" section missing');

    if (bodyText.includes('Executor')) console.log('✅ "Executor" section found');
    else console.error('❌ "Executor" section missing');

    if (bodyText.includes('Specialists')) console.log('✅ "Specialists" section found');
    else console.error('❌ "Specialists" section missing');

    // 4. Test Interaction: Deploy without Architect
    console.log('🖱️ Clicking "Deploy Team" (expecting error)...');
    
    const deployClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const deployBtn = buttons.find(b => b.textContent?.includes('Deploy Team'));
        if (deployBtn) {
            (deployBtn as HTMLElement).click();
            return true;
        }
        return false;
    });

    if (!deployClicked) throw new Error('"Deploy Team" button not found');

    // 5. Verify Toast Error
    // Wait for toast to appear. Toast usually has class 'toast' or contains text
    try {
        await page.waitForFunction(
            () => document.body.innerText.includes('Main Architect is required'),
            { timeout: 2000 }
        );
        console.log('✅ Error Toast appeared: "Main Architect is required!"');
    } catch (e) {
        console.error('❌ Error Toast DID NOT appear');
        throw e;
    }

    console.log('🎉 Test Complete: SUCCESS');

  } catch (error) {
    console.error('❌ Test Failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
