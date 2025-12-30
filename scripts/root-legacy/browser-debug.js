const puppeteer = require('puppeteer');
 
async function debugBrowser() {
  console.log('Launching browser for debug...');
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: { width: 1400, height: 900 }
  });
  
  const page = await browser.newPage();
  
  // Capture console messages
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log('[BROWSER ' + msg.type().toUpperCase() + ']', msg.text());
    }
  });
  
  // Check Dashboard - why showing offline?
  console.log('\n=== CHECKING DASHBOARD STATUS ===');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  
  // Wait a bit for data to load
  await new Promise(r => setTimeout(r, 2000));
  
  // Check what /api/status returns
  const statusResult = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/status');
      return { ok: res.ok, data: await res.json() };
    } catch(e) {
      return { error: e.message };
    }
  });
  console.log('Dashboard fetched /api/status:', JSON.stringify(statusResult));
  
  // Check Tooly page - why no models?
  console.log('\n=== CHECKING TOOLY MODELS ===');
  await page.goto('http://localhost:5173/tooly', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  
  const modelsResult = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/tooly/models');
      const data = await res.json();
      return { ok: res.ok, modelCount: data.models?.length, sample: data.models?.slice(0,3) };
    } catch(e) {
      return { error: e.message };
    }
  });
  console.log('Tooly fetched /api/tooly/models:', JSON.stringify(modelsResult));
  
  // Check React state
  const pageContent = await page.content();
  const hasNoModels = pageContent.includes('No models discovered');
  console.log('Page shows "No models discovered":', hasNoModels);
  
  // Check if there are any network errors
  console.log('\n=== NETWORK REQUESTS ===');
  
  await browser.close();
}

debugBrowser().catch(console.error);

