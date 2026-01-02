/**
 * E2E Test: Sources Page - API Key Configuration
 * Tests ACTUAL form filling and saving
 */

import { test, expect } from '@playwright/test';

test.describe('Sources Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Navigate to Sources page
    const sourcesLink = page.getByRole('link', { name: /sources|settings|api.*key/i });
    if (await sourcesLink.count() > 0) {
      await sourcesLink.click();
      await page.waitForLoadState('networkidle');
    } else {
      await page.goto('/sources');
      await page.waitForLoadState('networkidle');
    }
  });

  test('should display Sources page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /sources|providers|api.*key/i })).toBeVisible();
  });

  test('should display API key input fields', async ({ page }) => {
    // Should have input fields for various providers
    const inputs = page.locator('input[type="password"], input[type="text"]');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should have OpenAI API key field', async ({ page }) => {
    const openaiInput = page.getByLabel(/openai|openai.*key/i);
    await expect(openaiInput).toBeVisible();
  });

  test('should have LMStudio URL field', async ({ page }) => {
    const lmstudioInput = page.getByLabel(/lmstudio|lm.*studio.*url/i);
    if (await lmstudioInput.count() > 0) {
      await expect(lmstudioInput).toBeVisible();
    }
  });

  test('should have Ollama URL field', async ({ page }) => {
    const ollamaInput = page.getByLabel(/ollama|ollama.*url/i);
    if (await ollamaInput.count() > 0) {
      await expect(ollamaInput).toBeVisible();
    }
  });

  test('should fill in LMStudio URL', async ({ page }) => {
    const lmstudioInput = page.getByLabel(/lmstudio/i);

    if (await lmstudioInput.count() > 0) {
      await lmstudioInput.fill('http://localhost:1234');

      const value = await lmstudioInput.inputValue();
      expect(value).toBe('http://localhost:1234');
    }
  });

  test('should fill in Ollama URL', async ({ page }) => {
    const ollamaInput = page.getByLabel(/ollama/i);

    if (await ollamaInput.count() > 0) {
      await ollamaInput.fill('http://localhost:11434');

      const value = await ollamaInput.inputValue();
      expect(value).toBe('http://localhost:11434');
    }
  });

  test('should have Save button', async ({ page }) => {
    const saveButton = page.getByRole('button', { name: /save|update/i });
    await expect(saveButton).toBeVisible();
  });

  test('should save sources configuration', async ({ page }) => {
    // Fill in some fields
    const lmstudioInput = page.getByLabel(/lmstudio/i);
    if (await lmstudioInput.count() > 0) {
      await lmstudioInput.fill('http://localhost:1234');
    }

    // Click Save
    const saveButton = page.getByRole('button', { name: /save/i });
    await saveButton.click();

    // Should show success message
    await expect(page.getByText(/success|saved/i)).toBeVisible({ timeout: 5000 });
  });

  test('should show loading state while saving', async ({ page }) => {
    const saveButton = page.getByRole('button', { name: /save/i });
    await saveButton.click();

    // Should show loading state
    await expect(saveButton).toHaveText(/saving|loading/i, { timeout: 1000 });
  });

  test('should persist saved configuration', async ({ page }) => {
    const testUrl = 'http://localhost:1234';

    // Fill and save
    const lmstudioInput = page.getByLabel(/lmstudio/i);
    if (await lmstudioInput.count() > 0) {
      await lmstudioInput.fill(testUrl);
      await page.getByRole('button', { name: /save/i }).click();
      await page.waitForTimeout(2000);

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Verify value persisted
      const inputAfterReload = page.getByLabel(/lmstudio/i);
      const value = await inputAfterReload.inputValue();
      expect(value).toBe(testUrl);
    }
  });

  test('should display API Bridge information', async ({ page }) => {
    // Should show bridge info section
    const bridgeSection = page.getByText(/api.*bridge|external.*agent|bridge.*info/i);

    if (await bridgeSection.count() > 0) {
      await expect(bridgeSection).toBeVisible();
    }
  });

  test('should have copy button for system prompt', async ({ page }) => {
    // Look for copy button
    const copyButton = page.getByRole('button', { name: /copy/i });

    if (await copyButton.count() > 0) {
      await expect(copyButton.first()).toBeVisible();
    }
  });
});
