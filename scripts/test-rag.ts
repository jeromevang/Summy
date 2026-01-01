import puppeteer from 'puppeteer';

(async () => {
  console.log('🚀 Starting Test: RAG Page');
  
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Listen for console logs
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.toString()));

  try {
    // 1. Navigate to RAG
    console.log('📍 Navigating to http://localhost:5173/rag...');
    await page.goto('http://localhost:5173/rag', { waitUntil: 'networkidle0', timeout: 30000 });

    // 2. Verify Title (h1 inside page)
    try {
        await page.waitForSelector('h1', { timeout: 5000 });
        const titles = await page.$$eval('h1', els => els.map(e => e.textContent));
        const pageTitle = titles.find(t => t?.includes('RAG & GPS Navigator'));
        console.log(`✅ Page Titles Found: ${JSON.stringify(titles)}`);
        
        if (!pageTitle) throw new Error('Incorrect page title inside content');
    } catch (e) {
        throw new Error('Title verification failed: ' + e);
    }

    // 3. Verify Search Input
    const input = await page.$('input[placeholder*="Search codebase semantically"]');
    if (input) console.log('✅ Search Input found');
    else throw new Error('Search Input not found');

    // 4. Verify Index Button
    const indexBtnFound = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(b => b.textContent?.includes('Re-index Codebase'));
    });
    
    if (indexBtnFound) console.log('✅ "Re-index Codebase" button found');
    else console.error('❌ "Re-index Codebase" button missing');

    console.log('🎉 Test Complete: SUCCESS');

  } catch (error) {
    console.error('❌ Test Failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
