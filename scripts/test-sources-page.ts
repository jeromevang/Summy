import puppeteer from 'puppeteer';

(async () => {
  console.log('🚀 Starting Test: Sources & Providers Page');
  
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Listen for console logs
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.toString()));

  try {
    // 1. Navigate to Sources
    console.log('📍 Navigating to http://localhost:5173/sources...');
    await page.goto('http://localhost:5173/sources', { waitUntil: 'networkidle0', timeout: 30000 });

    // Debug: Take screenshot
    await page.screenshot({ path: 'debug-sources-page.png' });
    console.log('📸 Screenshot saved to debug-sources-page.png');

    // 2. Verify Title
    try {
        await page.waitForSelector('h1', { timeout: 5000 });
        const title = await page.$eval('h1', el => el.textContent);
        console.log(`✅ Page Title Found: "${title}"`);
        if (!title?.includes('Sources & Providers')) throw new Error('Incorrect page title');
    } catch (e) {
        const content = await page.content();
        console.log('⚠️ Page Content Dump:', content.slice(0, 500) + '...'); // First 500 chars
        throw e;
    }

    // 3. Check Inputs
    const inputs = await page.$$eval('input', els => els.map(e => ({ 
      placeholder: e.placeholder,
      value: e.value 
    })));
    
    console.log('📋 Found Inputs:', inputs.length);
    const hasOpenAI = inputs.some(i => i.placeholder?.includes('sk-'));
    const hasOllama = inputs.some(i => i.placeholder?.includes('localhost:11434'));
    
    if (hasOpenAI) console.log('✅ OpenAI Input found');
    else console.error('❌ OpenAI Input NOT found');
    
    if (hasOllama) console.log('✅ Ollama Input found');
    else console.error('❌ Ollama Input NOT found');

    // 4. Test Interaction
    console.log('✍️  Testing Input Interaction...');
    // Find OpenAI input by placeholder (assuming standard placeholder)
    await page.type('input[placeholder*="sk-"]', 'sk-test-key-123');
    
    // 5. Test Save
    console.log('💾 Clicking Save...');
    
      // Find button by text
      const buttonFound = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const saveBtn = buttons.find(b => b.textContent?.includes('Save Changes'));
        if (saveBtn) {
          (saveBtn as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (buttonFound) {
        console.log('✅ Save clicked');
      
      // Wait for saving state
      try {
        await page.waitForFunction(
          () => document.body.innerText.includes('Saving...'),
          { timeout: 1000 }
        );
        console.log('✅ "Saving..." state observed');
      } catch (e) {
        console.log('⚠️  "Saving..." state too fast or missed');
      }
      
      // Wait for revert to "Save Changes"
      await page.waitForFunction(
        () => document.body.innerText.includes('Save Changes'),
        { timeout: 2000 }
      );
      console.log('✅ Returned to idle state');
      
    } else {
      throw new Error('Save button not found');
    }

    console.log('🎉 Test Complete: SUCCESS');

  } catch (error) {
    console.error('❌ Test Failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
