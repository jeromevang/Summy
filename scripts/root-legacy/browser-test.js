const puppeteer = require('puppeteer');

async function testBrowser() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: { width: 1400, height: 900 }
  });
  
  const page = await browser.newPage();
  
  // Test Dashboard
  console.log('\n=== TESTING DASHBOARD (/) ===');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'test-dashboard.png' });
  
  // Check for errors
  const dashboardContent = await page.content();
  if (dashboardContent.includes('error') || dashboardContent.includes('Error')) {
    console.log('WARNING: Possible error on Dashboard');
  } else {
    console.log('Dashboard loaded successfully');
  }
  
  // Get page title/header
  const dashTitle = await page.$eval('h1', el => el.textContent).catch(() => 'No H1 found');
  console.log('Page title: ' + dashTitle);
  
  // Test Tooly page
  console.log('\n=== TESTING TOOLY (/tooly) ===');
  await page.goto('http://localhost:5173/tooly', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'test-tooly.png' });
  
  const toolyTitle = await page.$eval('h1', el => el.textContent).catch(() => 'No H1 found');
  console.log('Page title: ' + toolyTitle);
  
  // Check tabs exist
  const tabs = await page.$$eval('button', buttons => 
    buttons.map(b => b.textContent).filter(t => ['Models', 'Tests', 'Logs'].some(x => t.includes(x)))
  );
  console.log('Tabs found: ' + tabs.join(', '));
  
  // Test Sessions page
  console.log('\n=== TESTING SESSIONS (/sessions) ===');
  await page.goto('http://localhost:5173/sessions', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'test-sessions.png' });
  
  const sessionsTitle = await page.$eval('h1', el => el.textContent).catch(() => 'No H1 found');
  console.log('Page title: ' + sessionsTitle);
  
  // Test Settings page
  console.log('\n=== TESTING SETTINGS (/settings) ===');
  await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'test-settings.png' });
  
  const settingsTitle = await page.$eval('h1', el => el.textContent).catch(() => 'No H1 found');
  console.log('Page title: ' + settingsTitle);
  
  // Check module toggles
  const toggleLabels = await page.$$eval('label', labels => 
    labels.map(l => l.textContent).filter(t => t.includes('Summy') || t.includes('Tooly'))
  );
  console.log('Module toggles found: ' + toggleLabels.length);
  
  // Test Debug page
  console.log('\n=== TESTING DEBUG (/debug) ===');
  await page.goto('http://localhost:5173/debug', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'test-debug.png' });
  
  const debugTitle = await page.$eval('h1', el => el.textContent).catch(() => 'No H1 found');
  console.log('Page title: ' + debugTitle);
  
  console.log('\n=== BROWSER TEST COMPLETE ===');
  console.log('Screenshots saved: test-dashboard.png, test-tooly.png, test-sessions.png, test-settings.png, test-debug.png');
  
  // Keep browser open for 5 seconds so user can see
  await new Promise(r => setTimeout(r, 5000));
  
  await browser.close();
}

testBrowser().catch(console.error);

