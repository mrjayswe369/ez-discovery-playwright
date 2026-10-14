import { test, expect } from '../fixtures/baseFixtures';

test.describe('EZ Migrate Login', () => {
  test('should display login page correctly', async ({ loginPage }) => {
    await loginPage.goto();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();
  });

  test('should login with valid credentials', async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.login(process.env.LOGIN_EMAIL!, process.env.LOGIN_PASSWORD!);

    await page.waitForURL(/discovery|insights|dashboard|home/i, { timeout: 15000 });
    await expect(page.getByText(/Discovery Landscape/i)).toBeVisible({ timeout: 10000 });
  });

  test('should show error for invalid credentials', async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.login('wrong@email.com', 'wrongpass');

    await expect(page.getByText(/invalid|incorrect|error|failed|wrong/i)).toBeVisible();
  });
});