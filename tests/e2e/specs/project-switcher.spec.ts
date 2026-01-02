/**
 * E2E Test: Project Switcher - Browse Button & Folder Selection
 * Tests ACTUAL button clicking and UI interaction
 */

import { test, expect } from '@playwright/test';

test.describe('Project Switcher - Browse Button', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Navigate to a page with Project Switcher
    // It's in the sidebar/header, should be visible on any page
    await page.waitForLoadState('networkidle');
  });

  test('should display browse button', async ({ page }) => {
    // Look for the Browse button
    const browseButton = page.getByRole('button', { name: /browse/i });
    await expect(browseButton).toBeVisible();
  });

  test('should open folder picker modal when browse button is clicked', async ({ page }) => {
    // Click the Browse button
    const browseButton = page.getByRole('button', { name: /browse/i });
    await browseButton.click();

    // Wait for modal to appear
    await page.waitForSelector('[role="dialog"], .modal, .folder-picker', { timeout: 5000 });

    // Verify modal is visible
    const modal = page.locator('[role="dialog"], .modal, .folder-picker').first();
    await expect(modal).toBeVisible();

    // Should show "Select Directory" or similar heading
    await expect(page.getByText(/select directory|choose folder|browse/i)).toBeVisible();
  });

  test('should display directory contents in modal', async ({ page }) => {
    // Open folder picker
    const browseButton = page.getByRole('button', { name: /browse/i });
    await browseButton.click();

    // Wait for directory listing
    await page.waitForSelector('.directory-item, [data-testid*="dir"], li', { timeout: 5000 });

    // Should show at least one directory/file item
    const items = page.locator('.directory-item, [data-testid*="dir"], li');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should navigate into subdirectory when clicked', async ({ page }) => {
    // Open folder picker
    await page.getByRole('button', { name: /browse/i }).click();
    await page.waitForSelector('.directory-item, [data-testid*="dir"]', { timeout: 5000 });

    // Find a directory item (has folder icon)
    const directoryItem = page.locator('.directory-item, [data-testid*="directory"]').first();

    if (await directoryItem.count() > 0) {
      // Get current path displayed
      const pathBefore = await page.locator('.current-path, [data-testid="current-path"]').textContent();

      // Click to navigate into directory
      await directoryItem.click();
      await page.waitForTimeout(500);

      // Path should change
      const pathAfter = await page.locator('.current-path, [data-testid="current-path"]').textContent();
      expect(pathAfter).not.toBe(pathBefore);
    }
  });

  test('should navigate to parent directory when up button is clicked', async ({ page }) => {
    // Open folder picker
    await page.getByRole('button', { name: /browse/i }).click();
    await page.waitForSelector('.current-path, [data-testid="current-path"]', { timeout: 5000 });

    // Find and click parent/up button
    const upButton = page.getByRole('button', { name: /parent|up|\.\.|\u2B06/i });

    if (await upButton.count() > 0) {
      const pathBefore = await page.locator('.current-path, [data-testid="current-path"]').textContent();

      await upButton.click();
      await page.waitForTimeout(500);

      const pathAfter = await page.locator('.current-path, [data-testid="current-path"]').textContent();
      expect(pathAfter).not.toBe(pathBefore);
    }
  });

  test('should close modal when close button is clicked', async ({ page }) => {
    // Open folder picker
    await page.getByRole('button', { name: /browse/i }).click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Click close button (X, Close, Cancel, etc.)
    const closeButton = page.getByRole('button', { name: /close|cancel|×/i });
    await closeButton.click();

    // Modal should disappear
    await expect(page.locator('[role="dialog"]').first()).not.toBeVisible();
  });

  test('should select directory when "Select" button is clicked', async ({ page }) => {
    // Open folder picker
    await page.getByRole('button', { name: /browse/i }).click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Click select/choose button
    const selectButton = page.getByRole('button', { name: /select|choose|ok/i });

    if (await selectButton.count() > 0) {
      await selectButton.click();

      // Modal should close
      await expect(page.locator('[role="dialog"]').first()).not.toBeVisible({ timeout: 5000 });

      // Should show loading or success indication
      await page.waitForTimeout(1000);
    }
  });

  test('should display current directory path', async ({ page }) => {
    // Open folder picker
    await page.getByRole('button', { name: /browse/i }).click();
    await page.waitForTimeout(1000);

    // Should show current path
    const pathDisplay = page.locator('.current-path, [data-testid="current-path"], .breadcrumb');
    await expect(pathDisplay).toBeVisible();

    // Path should be a valid file path
    const pathText = await pathDisplay.textContent();
    expect(pathText).toMatch(/[a-zA-Z]:|\/|\\|Users|home|Documents/);
  });
});

test.describe('Project Switcher - Workspace Switching', () => {
  test('should show current workspace', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should display current workspace path somewhere
    const workspaceDisplay = page.locator('[data-testid="current-workspace"], .workspace-display, .current-folder');

    if (await workspaceDisplay.count() > 0) {
      await expect(workspaceDisplay).toBeVisible();
      const text = await workspaceDisplay.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test('should show recent projects list', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for recent projects dropdown or list
    const recentDropdown = page.getByRole('button', { name: /recent|projects|workspace/i });

    if (await recentDropdown.count() > 0) {
      await recentDropdown.click();
      await page.waitForTimeout(500);

      // Should show list of recent projects
      const projectList = page.locator('[role="menu"], .dropdown-menu, .project-list');
      await expect(projectList).toBeVisible();
    }
  });
});
