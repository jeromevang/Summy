import { chromium, Browser, Page, BrowserContext } from "playwright";

interface BrowserState {
  browser: Browser | null;
  context: BrowserContext | null;
  pages: Page[];
  currentPageIndex: number;
  consoleMessages: Array<{ type: string; text: string; timestamp: string }>;
  networkRequests: Array<{ method: string; url: string; status?: number; timestamp: string }>;
}

const browserState: BrowserState = {
  browser: null,
  context: null,
  pages: [],
  currentPageIndex: 0,
  consoleMessages: [],
  networkRequests: []
};

export async function ensureBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  if (!browserState.browser) {
    browserState.browser = await chromium.launch({ headless: false });
    browserState.context = await browserState.browser.newContext();
    const page = await browserState.context.newPage();

    page.on('console', msg => {
      browserState.consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      });
      if (browserState.consoleMessages.length > 100) {
        browserState.consoleMessages.shift();
      }
    });

    page.on('request', req => {
      browserState.networkRequests.push({
        method: req.method(),
        url: req.url(),
        timestamp: new Date().toISOString()
      });
    });

    page.on('response', res => {
      const req = browserState.networkRequests.find(r => r.url === res.url() && !r.status);
      if (req) req.status = res.status();
    });

    browserState.pages = [page];
    browserState.currentPageIndex = 0;
  }

  return {
    browser: browserState.browser,
    context: browserState.context!,
    page: browserState.pages[browserState.currentPageIndex]
  };
}

export function getCurrentPage(): Page | null {
  return browserState.pages[browserState.currentPageIndex] || null;
}

export function getBrowserState() {
  return browserState;
}

export async function closeBrowser() {
  if (browserState.browser) {
    await browserState.browser.close();
    browserState.browser = null;
    browserState.context = null;
    browserState.pages = [];
  }
}
