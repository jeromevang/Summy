const puppeteer = require('puppeteer');

const BASE_URL = 'http://localhost:5173';
const ROUTES = [
  '/',
  '/sessions',
  '/tooly',
  '/tooly/readiness',
  '/tooly/combo-test',
  '/tooly/prosthetics',
  '/tooly/controller',
  '/rag',
  '/settings',
  '/debug'
];

(async () => {
  console.log('🚀 Starting Client Page Health Check...');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false, // Visible browser window
      defaultViewport: null,
      args: ['--start-maximized'] // Start maximized
    });
  } catch (error) {
    console.error('❌ Failed to launch browser. Ensure Puppeteer is installed.');
    console.error(error);
    process.exit(1);
  }

  const page = await browser.newPage();

  // Pipe browser console logs to terminal
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    // Filter out HMR logs or minor warnings if desired, currently showing all
    if (type === 'error') {
      console.error(`[BROWSER CONSOLE ERROR] ${text}`);
    } else if (type === 'warning') {
      console.warn(`[BROWSER CONSOLE WARN]  ${text}`);
    } else {
      console.log(`[BROWSER CONSOLE LOG]   ${text}`);
    }
  });

  page.on('pageerror', err => {
    console.error(`[BROWSER PAGE ERROR]  ${err.toString()}`);
  });

  for (const route of ROUTES) {
    const url = `${BASE_URL}${route}`;
    console.log(`
--------------------------------------------------`);
    console.log(`🔍 Visiting: ${route}`);
    
    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 10000 });
      
      // Basic check: look for root element or specific indicators
      const content = await page.content();
      if (content.includes('404 Not Found') || content.includes('Cannot GET')) {
         console.error(`❌ Page ${route} returned a 404/Error.`);
      } else {
         console.log(`✅ Page ${route} loaded.`);
      }

      // Brief pause to allow user to see
      await new Promise(r => setTimeout(r, 2000));

    } catch (error) {
      console.error(`❌ Error visiting ${route}: ${error.message}`);
    }
  }

  console.log(`
--------------------------------------------------`);
  console.log('🏁 Check complete.');
  // await browser.close(); // Keeping it open per "interactively" request might be better, but script needs to end.
  // Closing for now to finish the task, or I can leave it if I wait for input.
  // I will close it to return control.
  await browser.close();
})();
