
import { test, expect } from '../fixtures/baseFixtures';

test.describe('EZ Discovery - Login Tests', { tag: ['@ci', '@repeatable', '@login', '@read-only'] }, () => {

  test('should display login page correctly', async ({ loginPage }) => {
    await loginPage.goto();

    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();
  });

  test('should login with valid credentials', async ({ loginPage, page }) => {
    const email = process.env.TEST_EMAIL;
    const password = process.env.TEST_PASSWORD;

    if (!email || !password) throw new Error('QA test credentials are missing');

    await loginPage.goto();
    await loginPage.login(email!, password!);

    // Replace with the confirmed post-login URL
    await expect(page).toHaveURL(
      /discovery|insights|dashboard|home/i,
      { timeout: 15000 }
    );

    // Replace with a verified dashboard locator
    await expect(
      page.getByText('Discovery Landscape', { exact: true })
    ).toBeVisible({ timeout: 15000 });
  });

  test('should show error for invalid credentials', async ({ loginPage, page }) => {
    await loginPage.goto();

    await loginPage.login(
      'wrong@email.com',
      'wrongpass'
    );

    // Update to the actual application error locator
    await expect(
      page.getByRole('alert')
    ).toBeVisible({ timeout: 10000 });
  });

});
