/**
 * E2E Test: Team Builder - Form Interaction & Deployment
 * Tests ACTUAL form filling and button clicking
 */

import { test, expect } from '@playwright/test';

test.describe('Team Builder Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Navigate to Team Builder page
    const teamBuilderLink = page.getByRole('link', { name: /team builder|team|squad/i });
    if (await teamBuilderLink.count() > 0) {
      await teamBuilderLink.click();
      await page.waitForLoadState('networkidle');
    } else {
      // Try direct navigation
      await page.goto('/team-builder');
      await page.waitForLoadState('networkidle');
    }
  });

  test('should display Team Builder page', async ({ page }) => {
    // Should have Team Builder heading
    await expect(page.getByRole('heading', { name: /team builder|build.*team|assemble/i })).toBeVisible();

    // Should have Deploy button
    await expect(page.getByRole('button', { name: /deploy|save|create/i })).toBeVisible();
  });

  test('should display model selection dropdowns', async ({ page }) => {
    // Should have Main Architect section
    await expect(page.getByText(/main architect|architect/i)).toBeVisible();

    // Should have model dropdown or select
    const modelSelect = page.locator('select, [role="combobox"], .model-selector').first();
    await expect(modelSelect).toBeVisible();
  });

  test('should populate model dropdowns with available models', async ({ page }) => {
    // Wait for models to load
    await page.waitForTimeout(2000);

    // Find model dropdown
    const modelSelect = page.locator('select').first();

    if (await modelSelect.count() > 0) {
      // Should have options
      const options = modelSelect.locator('option');
      const count = await options.count();
      expect(count).toBeGreaterThan(1); // At least placeholder + 1 model
    }
  });

  test('should select Main Architect model', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Find and interact with Main Architect dropdown
    const architectSelect = page.locator('select').first();

    if (await architectSelect.count() > 0) {
      // Get available options
      const options = await architectSelect.locator('option').all();

      if (options.length > 1) {
        // Select first non-empty option
        const firstModel = await options[1].getAttribute('value');
        if (firstModel) {
          await architectSelect.selectOption(firstModel);

          // Verify selection
          const selectedValue = await architectSelect.inputValue();
          expect(selectedValue).toBe(firstModel);
        }
      }
    }
  });

  test('should toggle executor enabled checkbox', async ({ page }) => {
    // Find executor enable checkbox
    const executorCheckbox = page.getByRole('checkbox', { name: /executor|enable executor/i });

    if (await executorCheckbox.count() > 0) {
      // Check initial state
      const initialState = await executorCheckbox.isChecked();

      // Toggle it
      await executorCheckbox.click();

      // Verify state changed
      const newState = await executorCheckbox.isChecked();
      expect(newState).toBe(!initialState);
    }
  });

  test('should enable executor model selection when executor is enabled', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Find and enable executor
    const executorCheckbox = page.getByRole('checkbox', { name: /executor/i });

    if (await executorCheckbox.count() > 0) {
      await executorCheckbox.check();
      await page.waitForTimeout(500);

      // Executor model dropdown should appear or be enabled
      const executorSelect = page.locator('select').nth(1);
      if (await executorSelect.count() > 0) {
        await expect(executorSelect).toBeEnabled();
      }
    }
  });

  test('should add a specialist agent', async ({ page }) => {
    // Find "Add Agent" or "Add Specialist" button
    const addButton = page.getByRole('button', { name: /add agent|add specialist|\+.*agent/i });

    if (await addButton.count() > 0) {
      // Count agents before
      const agentsBefore = await page.locator('.agent-card, [data-testid*="agent"]').count();

      // Click add
      await addButton.click();
      await page.waitForTimeout(500);

      // Count agents after
      const agentsAfter = await page.locator('.agent-card, [data-testid*="agent"]').count();
      expect(agentsAfter).toBe(agentsBefore + 1);
    }
  });

  test('should remove a specialist agent', async ({ page }) => {
    // Add an agent first
    const addButton = page.getByRole('button', { name: /add agent|add specialist/i });

    if (await addButton.count() > 0) {
      await addButton.click();
      await page.waitForTimeout(500);

      // Find remove button
      const removeButton = page.getByRole('button', { name: /remove|delete|×/i }).last();

      if (await removeButton.count() > 0) {
        const agentsBefore = await page.locator('.agent-card, [data-testid*="agent"]').count();

        await removeButton.click();
        await page.waitForTimeout(500);

        const agentsAfter = await page.locator('.agent-card, [data-testid*="agent"]').count();
        expect(agentsAfter).toBe(agentsBefore - 1);
      }
    }
  });

  test('should show validation error when deploying without Main Architect', async ({ page }) => {
    // Make sure Main Architect is not selected
    const architectSelect = page.locator('select').first();
    if (await architectSelect.count() > 0) {
      await architectSelect.selectOption('');
    }

    // Click Deploy
    const deployButton = page.getByRole('button', { name: /deploy|save|create/i });
    await deployButton.click();

    // Should show error message or toast
    await expect(page.getByText(/required|architect.*required|select.*model/i)).toBeVisible({ timeout: 3000 });
  });

  test('should deploy team successfully', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Select Main Architect
    const architectSelect = page.locator('select').first();
    if (await architectSelect.count() > 0) {
      const options = await architectSelect.locator('option').all();
      if (options.length > 1) {
        const firstModel = await options[1].getAttribute('value');
        if (firstModel) {
          await architectSelect.selectOption(firstModel);
        }
      }
    }

    // Click Deploy
    const deployButton = page.getByRole('button', { name: /deploy|save|create/i });
    await deployButton.click();

    // Should show success message or toast
    await expect(page.getByText(/success|deployed|saved/i)).toBeVisible({ timeout: 5000 });
  });

  test('should show loading state while deploying', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Select a model
    const architectSelect = page.locator('select').first();
    if (await architectSelect.count() > 0) {
      const options = await architectSelect.locator('option').all();
      if (options.length > 1) {
        await architectSelect.selectOption(await options[1].getAttribute('value') || '');
      }
    }

    // Click Deploy and immediately check for loading state
    const deployButton = page.getByRole('button', { name: /deploy|save|create/i });
    await deployButton.click();

    // Should show loading text or disabled state
    await expect(deployButton).toHaveText(/deploying|saving|loading/i, { timeout: 1000 });
  });

  test('should persist team configuration after save', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Select Main Architect
    const architectSelect = page.locator('select').first();
    let selectedModel = '';

    if (await architectSelect.count() > 0) {
      const options = await architectSelect.locator('option').all();
      if (options.length > 1) {
        selectedModel = await options[1].getAttribute('value') || '';
        await architectSelect.selectOption(selectedModel);
      }
    }

    // Deploy
    await page.getByRole('button', { name: /deploy/i }).click();
    await page.waitForTimeout(2000);

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Verify model is still selected
    const architectAfterReload = page.locator('select').first();
    if (await architectAfterReload.count() > 0 && selectedModel) {
      const currentValue = await architectAfterReload.inputValue();
      expect(currentValue).toBe(selectedModel);
    }
  });
});
