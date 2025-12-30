import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult, errorResult } from "../utils/helpers.js";
import { ensureBrowser, getCurrentPage, getBrowserState } from "../utils/browser.js";
import { resolvePath } from "../utils/fs.js";

export function registerBrowserTools(server: McpServer) {
  server.registerTool("browser_navigate", {
    description: "Navigate to a URL in the browser",
    inputSchema: { url: z.string().describe("URL to navigate to") }
  }, async ({ url }: { url: string }) => {
    console.error(`[MCP] browser_navigate: ${url}`);
    try {
      const { page } = await ensureBrowser();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      return textResult(`Navigated to: ${page.url()}\nTitle: ${await page.title()}`);
    } catch (err: any) {
      return errorResult(`Navigation failed: ${err.message}`);
    }
  });

  server.registerTool("browser_go_back", { description: "Go back in browser history" }, async () => {
    console.error(`[MCP] browser_go_back`);
    try {
      const page = getCurrentPage();
      if (!page) return errorResult("No browser page open");
      await page.goBack();
      return textResult(`Went back to: ${page.url()}`);
    } catch (err: any) {
      return errorResult(`Go back failed: ${err.message}`);
    }
  });

  server.registerTool("browser_go_forward", { description: "Go forward in browser history" }, async () => {
    console.error(`[MCP] browser_go_forward`);
    try {
      const page = getCurrentPage();
      if (!page) return errorResult("No browser page open");
      await page.goForward();
      return textResult(`Went forward to: ${page.url()}`);
    } catch (err: any) {
      return errorResult(`Go forward failed: ${err.message}`);
    }
  });

  server.registerTool("browser_click", {
    description: "Click an element on the page",
    inputSchema: {
      selector: z.string().describe("CSS selector or text to click"),
      button: z.enum(["left", "right", "middle"]).optional().describe("Mouse button"),
      clickCount: z.number().optional().describe("Number of clicks (1 or 2)")
    }
  }, async ({ selector, button = "left", clickCount = 1 }: { selector: string; button?: "left" | "right" | "middle"; clickCount?: number }) => {
    console.error(`[MCP] browser_click: ${selector}`);
    try {
      const page = getCurrentPage();
      if (!page) return errorResult("No browser page open");
      await page.click(selector, { button, clickCount, timeout: 10000 });
      return textResult(`Clicked: ${selector}`);
    } catch (err: any) {
      return errorResult(`Click failed: ${err.message}`);
    }
  });

  server.registerTool("browser_type", {
    description: "Type text into an editable element",
    inputSchema: {
      selector: z.string().describe("CSS selector of the input element"),
      text: z.string().describe("Text to type"),
      clear: z.boolean().optional().describe("Clear existing text first"),
      submit: z.boolean().optional().describe("Press Enter after typing")
    }
  }, async ({ selector, text, clear = false, submit = false }: { selector: string; text: string; clear?: boolean; submit?: boolean }) => {
    console.error(`[MCP] browser_type: ${selector}`);
    try {
      const page = getCurrentPage();
      if (!page) return errorResult("No browser page open");
      if (clear) await page.fill(selector, "");
      await page.fill(selector, text);
      if (submit) await page.press(selector, "Enter");
      return textResult(`Typed into: ${selector}`);
    } catch (err: any) {
      return errorResult(`Type failed: ${err.message}`);
    }
  });

  server.registerTool("browser_hover", {
    description: "Hover over an element",
    inputSchema: { selector: z.string().describe("CSS selector to hover over") }
  }, async ({ selector }: { selector: string }) => {
    console.error(`[MCP] browser_hover: ${selector}`);
    try {
      const page = getCurrentPage();
      if (!page) return errorResult("No browser page open");
      await page.hover(selector, { timeout: 10000 });
      return textResult(`Hovered over: ${selector}`);
    } catch (err: any) {
      return errorResult(`Hover failed: ${err.message}`);
    }
  });

  server.registerTool("browser_select_option", {
    description: "Select an option in a dropdown",
    inputSchema: {
      selector: z.string().describe("CSS selector of the select element"),
      value: z.string().describe("Value or label to select")
    }
  }, async ({ selector, value }: { selector: string; value: string }) => {
    console.error(`[MCP] browser_select_option: ${selector} = ${value}`);
    try {
      const page = getCurrentPage();
      if (!page) return errorResult("No browser page open");
      await page.selectOption(selector, value);
      return textResult(`Selected "${value}" in: ${selector}`);
    } catch (err: any) {
      return errorResult(`Select option failed: ${err.message}`);
    }
  });

  server.registerTool("browser_press_key", {
    description: "Press a keyboard key",
    inputSchema: { key: z.string().describe("Key to press (e.g., 'Enter', 'Escape', 'ArrowDown')") }
  }, async ({ key }: { key: string }) => {
    console.error(`[MCP] browser_press_key: ${key}`);
    try {
      const page = getCurrentPage();
      if (!page) return errorResult("No browser page open");
      await page.keyboard.press(key);
      return textResult(`Pressed key: ${key}`);
    } catch (err: any) {
      return errorResult(`Press key failed: ${err.message}`);
    }
  });

  server.registerTool("browser_snapshot", {
    description: "Get accessibility snapshot of the current page (useful for understanding page structure)"
  }, async () => {
    console.error('[MCP] browser_snapshot');
    try {
      const page = getCurrentPage();
      if (!page) return errorResult("No browser page open");

      const url = page.url();
      const title = await page.title();

      const snapshot = await page.evaluate(`
        (() => {
          const getTree = (el, depth) => {
            if (depth > 5) return null;
            const children = [];
            for (const child of el.children) {
               const res = getTree(child, depth + 1);
               if (res) children.push(res);
            }
            let name = el.getAttribute("aria-label") || el.getAttribute("alt");
            if (!name && el.innerText) {
               if (el.childElementCount === 0) name = el.innerText.slice(0, 50);
            }
            return {
              tag: el.tagName.toLowerCase(),
              role: el.getAttribute("role"),
              name: name,
              children: children.length > 0 ? children : undefined
            };
          };
          return getTree(document.body, 0);
        })()
      `);

      return textResult(JSON.stringify({ url, title, snapshot }, null, 2));
    } catch (err: any) {
      return errorResult("Snapshot failed: " + err.message);
    }
  });

  server.registerTool("browser_fetch_content", {
    description: "Navigate to a URL, handle cookie/consent popups, and return the page text content. Best for dynamic pages that require JavaScript or have consent gates.",
    inputSchema: {
      url: z.string().describe("URL to fetch content from"),
      waitTime: z.number().optional().describe("Time to wait for page load in ms (default: 2000)"),
      dismissPopups: z.boolean().optional().describe("Try to dismiss cookie/consent popups (default: true)")
    }
  }, async ({ url, waitTime = 2000, dismissPopups = true }: { url: string; waitTime?: number; dismissPopups?: boolean }) => {
    console.error(`[MCP] browser_fetch_content: ${url}`);
    try {
      const { page } = await ensureBrowser();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(waitTime);

      if (dismissPopups) {
        const consentSelectors = [
          'button:has-text("Accept")', 'button:has-text("Accept all")', 'button:has-text("Accept All")',
          'button:has-text("Accepteren")', 'button:has-text("Akkoord")', 'button:has-text("Agree")',
          'button:has-text("I agree")', 'button:has-text("OK")', 'button:has-text("Got it")',
          'button:has-text("Allow")', 'button:has-text("Allow all")', 'button:has-text("Toestaan")',
          '[class*="accept"]', '[class*="consent"]', '[id*="accept"]', '[id*="consent"]',
          '.cookie-accept', '.accept-cookies', '#accept-cookies', '.privacy-accept',
          '.cmp-accept', '[data-testid="accept-button"]', '[data-action="accept"]',
        ];

        for (const selector of consentSelectors) {
          try {
            const button = await page.$(selector);
            if (button && await button.isVisible()) {
              await button.click();
              await page.waitForTimeout(500);
              break;
            }
          } catch {}
        }
        try { await page.keyboard.press('Escape'); } catch {}
      }

      await page.waitForTimeout(500);

      const textContent = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script, style, noscript');
        scripts.forEach(el => el.remove());
        const main = document.querySelector('main, article, [role="main"], .content, #content');
        const contentElement = (main || document.body) as HTMLElement;
        let text = contentElement.innerText || '';
        text = text.replace(/\s+/g, ' ').trim();
        return text;
      });

      const title = await page.title();
      const finalUrl = page.url();
      const maxLength = 15000;
      const truncatedContent = textContent.length > maxLength ? textContent.slice(0, maxLength) + '\n\n[Content truncated...]' : textContent;

      return textResult(`URL: ${finalUrl}\nTitle: ${title}\n\n${truncatedContent}`);
    } catch (err: any) {
      return errorResult(`Failed to fetch content: ${err.message}`);
    }
  });

  server.registerTool("browser_take_screenshot", {
    description: "Take a screenshot of the current page",
    inputSchema: {
      path: z.string().optional().describe("File path to save screenshot"),
      fullPage: z.boolean().optional().describe("Capture full scrollable page"),
      selector: z.string().optional().describe("CSS selector to screenshot specific element")
    }
  }, async ({ path: savePath, fullPage = false, selector }: { path?: string; fullPage?: boolean; selector?: string }) => {
    console.error(`[MCP] browser_take_screenshot`);
    try {
      const page = getCurrentPage();
      if (!page) return errorResult("No browser page open");
      const screenshotPath = savePath || `screenshot_${Date.now()}.png`;
      const fullPath = resolvePath(screenshotPath);
      if (selector) {
        const element = await page.$(selector);
        if (!element) return errorResult(`Element not found: ${selector}`);
        await element.screenshot({ path: fullPath });
      } else {
        await page.screenshot({ path: fullPath, fullPage });
      }
      return textResult(`Screenshot saved to: ${screenshotPath}`);
    } catch (err: any) {
      return errorResult(`Screenshot failed: ${err.message}`);
    }
  });

  server.registerTool("browser_wait", {
    description: "Wait for a condition",
    inputSchema: {
      selector: z.string().optional().describe("CSS selector to wait for"),
      state: z.enum(["attached", "visible", "hidden", "detached"]).optional().describe("State to wait for"),
      timeout: z.number().optional().describe("Timeout in milliseconds"),
      time: z.number().optional().describe("Fixed time to wait in milliseconds")
    }
  }, async ({ selector, state = "visible", timeout = 30000, time }: { selector?: string; state?: string; timeout?: number; time?: number }) => {
    console.error(`[MCP] browser_wait: ${selector || `${time}ms`}`);
    try {
      const page = getCurrentPage();
      if (!page) return errorResult("No browser page open");
      if (time) { await page.waitForTimeout(time); return textResult(`Waited ${time}ms`); }
      if (selector) { await page.waitForSelector(selector, { state: state as any, timeout }); return textResult(`Element ${state}: ${selector}`); }
      return errorResult("Specify either 'selector' or 'time'");
    } catch (err: any) {
      return errorResult(`Wait failed: ${err.message}`);
    }
  });

  server.registerTool("browser_resize", {
    description: "Resize the browser window",
    inputSchema: {
      width: z.number().describe("Width in pixels"),
      height: z.number().describe("Height in pixels")
    }
  }, async ({ width, height }: { width: number; height: number }) => {
    console.error(`[MCP] browser_resize: ${width}x${height}`);
    try {
      const page = getCurrentPage();
      if (!page) return errorResult("No browser page open");
      await page.setViewportSize({ width, height });
      return textResult(`Resized to: ${width}x${height}`);
    } catch (err: any) {
      return errorResult(`Resize failed: ${err.message}`);
    }
  });

  server.registerTool("browser_handle_dialog", {
    description: "Handle browser dialogs (alert, confirm, prompt)",
    inputSchema: {
      accept: z.boolean().describe("Accept or dismiss the dialog"),
      promptText: z.string().optional().describe("Text to enter for prompt dialogs")
    }
  }, async ({ accept, promptText }: { accept: boolean; promptText?: string }) => {
    console.error(`[MCP] browser_handle_dialog: accept=${accept}`);
    try {
      const page = getCurrentPage();
      if (!page) return errorResult("No browser page open");
      page.once('dialog', async dialog => {
        if (accept) await dialog.accept(promptText);
        else await dialog.dismiss();
      });
      return textResult(`Dialog handler set: ${accept ? 'accept' : 'dismiss'}`);
    } catch (err: any) {
      return errorResult(`Dialog handler failed: ${err.message}`);
    }
  });

  server.registerTool("browser_drag", {
    description: "Drag and drop between two elements",
    inputSchema: {
      sourceSelector: z.string().describe("CSS selector of source element"),
      targetSelector: z.string().describe("CSS selector of target element")
    }
  }, async ({ sourceSelector, targetSelector }: { sourceSelector: string; targetSelector: string }) => {
    console.error(`[MCP] browser_drag: ${sourceSelector} -> ${targetSelector}`);
    try {
      const page = getCurrentPage();
      if (!page) return errorResult("No browser page open");
      await page.dragAndDrop(sourceSelector, targetSelector);
      return textResult(`Dragged from ${sourceSelector} to ${targetSelector}`);
    } catch (err: any) {
      return errorResult(`Drag failed: ${err.message}`);
    }
  });

  server.registerTool("browser_tabs", {
    description: "Manage browser tabs",
    inputSchema: {
      action: z.enum(["list", "new", "close", "select"]).describe("Tab action"),
      index: z.number().optional().describe("Tab index for close/select")
    }
  }, async ({ action, index }: { action: string; index?: number }) => {
    console.error(`[MCP] browser_tabs: ${action}`);
    try {
      const { context } = await ensureBrowser();
      const browserState = getBrowserState();
      switch (action) {
        case "list":
          const tabs = browserState.pages.map((p, i) => ({ index: i, url: p.url(), current: i === browserState.currentPageIndex }));
          return textResult(JSON.stringify(tabs, null, 2));
        case "new":
          const newPage = await context.newPage();
          browserState.pages.push(newPage);
          browserState.currentPageIndex = browserState.pages.length - 1;
          return textResult(`New tab created (index: ${browserState.currentPageIndex})`);
        case "close":
          const closeIdx = index ?? browserState.currentPageIndex;
          if (closeIdx < 0 || closeIdx >= browserState.pages.length) return errorResult(`Invalid tab index: ${closeIdx}`);
          await browserState.pages[closeIdx].close();
          browserState.pages.splice(closeIdx, 1);
          if (browserState.currentPageIndex >= browserState.pages.length) browserState.currentPageIndex = Math.max(0, browserState.pages.length - 1);
          return textResult(`Closed tab ${closeIdx}`);
        case "select":
          if (index === undefined) return errorResult("Tab index required");
          if (index < 0 || index >= browserState.pages.length) return errorResult(`Invalid tab index: ${index}`);
          browserState.currentPageIndex = index;
          return textResult(`Switched to tab ${index}: ${browserState.pages[index].url()}`);
        default:
          return errorResult(`Unknown action: ${action}`);
      }
    } catch (err: any) {
      return errorResult(`Tab operation failed: ${err.message}`);
    }
  });

  server.registerTool("browser_evaluate", {
    description: "Execute JavaScript in the browser context",
    inputSchema: {
      script: z.string().describe("JavaScript code to execute"),
      selector: z.string().optional().describe("Element to pass to the script")
    }
  }, async ({ script, selector }: { script: string; selector?: string }) => {
    console.error(`[MCP] browser_evaluate`);
    try {
      const page = getCurrentPage();
      if (!page) return errorResult("No browser page open");
      let result = selector ? await page.$eval(selector, (el, code) => eval(code), script) : await page.evaluate(script);
      return textResult(JSON.stringify(result, null, 2));
    } catch (err: any) {
      return errorResult(`Evaluate failed: ${err.message}`);
    }
  });

  server.registerTool("browser_console_messages", {
    description: "Get console messages from the browser"
  }, async () => {
    console.error(`[MCP] browser_console_messages`);
    return textResult(JSON.stringify(getBrowserState().consoleMessages, null, 2));
  });

  server.registerTool("browser_network_requests", {
    description: "Get network requests made by the browser"
  }, async () => {
    console.error(`[MCP] browser_network_requests`);
    return textResult(JSON.stringify(getBrowserState().networkRequests.slice(-50), null, 2));
  });
}
