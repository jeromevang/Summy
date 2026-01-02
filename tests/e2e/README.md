# End-to-End Browser Tests with Playwright

## 🎯 What These Tests Do

These tests **ACTUALLY click buttons, fill forms, and interact with the UI** in a real browser!

### Tests Created

1. **`project-switcher.spec.ts`** (11 tests)
   - ✅ Clicks Browse button
   - ✅ Opens folder picker modal
   - ✅ Displays directory contents
   - ✅ Navigates into subdirectories
   - ✅ Navigates to parent directory
   - ✅ Closes modal
   - ✅ Selects directory
   - ✅ Shows current path

2. **`team-builder.spec.ts`** (12 tests)
   - ✅ Displays model dropdowns
   - ✅ Populates dropdowns with models
   - ✅ Selects Main Architect
   - ✅ Toggles executor checkbox
   - ✅ Adds specialist agents
   - ✅ Removes specialist agents
   - ✅ Shows validation errors
   - ✅ Deploys team successfully
   - ✅ Shows loading state
   - ✅ Persists configuration

3. **`sources-page.spec.ts`** (13 tests)
   - ✅ Displays API key fields
   - ✅ Fills in LMStudio URL
   - ✅ Fills in Ollama URL
   - ✅ Saves configuration
   - ✅ Shows loading state
   - ✅ Persists saved config
   - ✅ Displays API Bridge info

4. **`navigation.spec.ts`** (13 tests)
   - ✅ Loads homepage
   - ✅ Navigates between pages
   - ✅ System HUD visible
   - ✅ Handles 404 pages
   - ✅ No console errors
   - ✅ Responsive on desktop/tablet/mobile

**Total**: **49 E2E tests** that actually interact with the browser!

---

## 🚀 Running E2E Tests

### Prerequisites

1. **Start all services**:
```bash
# From project root
npm run dev
```

This starts:
- Frontend: http://localhost:5173
- Backend: http://localhost:3001
- RAG: http://localhost:3002

2. **Install Playwright browsers** (first time only):
```bash
cd tests/e2e
npx playwright install chromium
```

### Run Tests

```bash
cd tests/e2e

# Run all tests
npm test

# Run with visible browser
npm run test:headed

# Run interactive UI mode
npm run test:ui

# Run specific test file
npm run test:project-switcher
npm run test:team-builder
npm run test:sources
npm run test:navigation

# Debug mode
npm run test:debug

# View test report
npm run report
```

---

## 📊 Test Results

### Expected Behavior

**Project Switcher**:
- ✅ Browse button opens modal
- ✅ Directory listing shows folders/files
- ✅ Click folder → navigate into it
- ✅ Up button → navigate to parent
- ✅ Select button → switch workspace

**Team Builder**:
- ✅ Dropdowns populated with models
- ✅ Can select Main Architect
- ✅ Can toggle Executor
- ✅ Can add/remove specialists
- ✅ Deploy button saves team
- ✅ Shows validation errors
- ✅ Configuration persists after reload

**Sources Page**:
- ✅ API key fields editable
- ✅ Save button works
- ✅ Configuration persists
- ✅ Shows success message

**Navigation**:
- ✅ All pages load
- ✅ Links navigate correctly
- ✅ No console errors
- ✅ Responsive on all screen sizes

---

## 🎥 Test Features

### Screenshots & Videos

Playwright automatically captures:
- **Screenshots** on test failure
- **Videos** of failed tests
- **Traces** for debugging

Find them in:
- `tests/e2e/test-results/` - Test artifacts
- `tests/e2e/playwright-report/` - HTML report

### Interactive UI Mode

```bash
npm run test:ui
```

Shows:
- Live browser preview
- Step-by-step execution
- Element locators
- Network requests
- Console logs

### Debug Mode

```bash
npm run test:debug
```

Opens:
- Playwright Inspector
- Step through tests
- Inspect elements
- View page state

---

## 🔍 What Gets Tested

### User Actions

✅ **Mouse Clicks**:
- Buttons
- Links
- Checkboxes
- Dropdown options
- Modal overlays

✅ **Keyboard Input**:
- Text fields
- Form inputs
- Selections

✅ **Navigation**:
- Page routing
- Modal open/close
- Directory traversal

✅ **Validation**:
- Form validation
- Error messages
- Success messages
- Loading states

✅ **Persistence**:
- Data saves to backend
- Configuration loads on page refresh
- State maintained across navigation

---

## 📝 Example Test

### Clicking Browse Button

```typescript
test('should open folder picker modal when browse button is clicked', async ({ page }) => {
  // Go to page
  await page.goto('/');

  // Find and click Browse button
  const browseButton = page.getByRole('button', { name: /browse/i });
  await browseButton.click();

  // Wait for modal to appear
  await page.waitForSelector('[role="dialog"]');

  // Verify modal is visible
  const modal = page.locator('[role="dialog"]');
  await expect(modal).toBeVisible();

  // Verify heading shows
  await expect(page.getByText(/select directory/i)).toBeVisible();
});
```

### Filling Form

```typescript
test('should select Main Architect model', async ({ page }) => {
  await page.goto('/team-builder');

  // Find dropdown
  const dropdown = page.locator('select').first();

  // Select an option
  await dropdown.selectOption('gpt-4');

  // Verify selection
  const value = await dropdown.inputValue();
  expect(value).toBe('gpt-4');
});
```

---

## 🎯 Coverage Summary

| Component | Actions Tested | Assertions |
|-----------|----------------|------------|
| **Project Switcher** | 8 user actions | 15+ assertions |
| **Team Builder** | 10 user actions | 20+ assertions |
| **Sources Page** | 6 user actions | 15+ assertions |
| **Navigation** | 10 user actions | 15+ assertions |

**Total**: **34 user actions** | **65+ assertions**

---

## 🐛 Debugging Failed Tests

### View Test Report

```bash
npm run report
```

Opens HTML report showing:
- Which tests failed
- Screenshots of failures
- Full error traces
- Network activity

### Run Single Test

```bash
# Debug specific test
npx playwright test specs/project-switcher.spec.ts --debug

# Run with visible browser
npx playwright test specs/team-builder.spec.ts --headed
```

### Common Issues

**"Timeout waiting for element"**:
- Element selector may be wrong
- Element may not exist
- Page may not have loaded

**"Element not visible"**:
- Modal not open
- Component not rendered
- CSS hiding element

**"Navigation failed"**:
- Page routing issue
- Link href incorrect
- Backend not responding

---

## 📚 Resources

- [Playwright Docs](https://playwright.dev)
- [Locator Strategies](https://playwright.dev/docs/locators)
- [Assertions](https://playwright.dev/docs/test-assertions)
- [Best Practices](https://playwright.dev/docs/best-practices)

---

## ✅ What This Proves

These E2E tests verify:

✅ **Browse button ACTUALLY opens modal** (not just API call)
✅ **Folder picker ACTUALLY shows directories** (visual verification)
✅ **Form fields ACTUALLY get filled** (user input simulation)
✅ **Deploy button ACTUALLY saves data** (full user flow)
✅ **Configuration ACTUALLY persists** (page refresh test)
✅ **All navigation links ACTUALLY work** (real browser clicks)

**Every test runs in a real browser and simulates real user interactions!** 🎉
