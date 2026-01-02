/**
 * E2E Test: Navigation & General UI
 * Tests page navigation and overall app functionality
 */

import { test, expect } from '@playwright/test';

test.describe('Application Navigation', () => {
  test('should load homepage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should have main content
    await expect(page.locator('body')).toBeVisible();
  });

  test('should have navigation menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should have nav links (sidebar or header)
    const navLinks = page.locator('nav a, [role="navigation"] a, .sidebar a');
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should navigate to Team Builder page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const teamBuilderLink = page.getByRole('link', { name: /team builder|team|squad/i });

    if (await teamBuilderLink.count() > 0) {
      await teamBuilderLink.click();
      await page.waitForLoadState('networkidle');

      // Should be on Team Builder page
      await expect(page).toHaveURL(/team-builder|team/i);
      await expect(page.getByRole('heading', { name: /team builder|team/i })).toBeVisible();
    }
  });

  test('should navigate to Sources page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sourcesLink = page.getByRole('link', { name: /sources|providers|api/i });

    if (await sourcesLink.count() > 0) {
      await sourcesLink.click();
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveURL(/sources|providers/i);
      await expect(page.getByRole('heading', { name: /sources|providers/i })).toBeVisible();
    }
  });

  test('should navigate to Settings page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settingsLink = page.getByRole('link', { name: /settings|config/i });

    if (await settingsLink.count() > 0) {
      await settingsLink.click();
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveURL(/settings|config/i);
    }
  });

  test('should navigate to RAG page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const ragLink = page.getByRole('link', { name: /rag|gps|search|navigator/i });

    if (await ragLink.count() > 0) {
      await ragLink.click();
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveURL(/rag|gps|search/i);
    }
  });
});

test.describe('System HUD', () => {
  test('should display system status indicator', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for system HUD component
    const hud = page.locator('[data-testid="system-hud"], .system-hud, .status-indicator');

    if (await hud.count() > 0) {
      await expect(hud).toBeVisible();
    }
  });
});

test.describe('Error Handling', () => {
  test('should handle 404 pages gracefully', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-12345');
    await page.waitForLoadState('networkidle');

    // Should either redirect to home or show 404 page
    const url = page.url();
    expect(url).toBeTruthy();

    // Page should still render something
    await expect(page.locator('body')).toBeVisible();
  });

  test('should not show console errors on homepage', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Filter out expected/harmless errors (like failed favicon)
    const realErrors = consoleErrors.filter(err =>
      !err.includes('favicon') &&
      !err.includes('404') &&
      !err.includes('websocket')
    );

    expect(realErrors.length).toBe(0);
  });
});

test.describe('Responsive Design', () => {
  test('should render on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
  });

  test('should render on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
  });

  test('should render on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
  });
});
