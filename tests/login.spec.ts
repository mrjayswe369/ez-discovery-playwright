import { test, expect } from '../fixtures/baseFixtures';

test.describe('EZ Migrate Login', () => {
  test('should display login page correctly', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login('process.env.LOGIN_EMAIL', 'process.env.LOGIN_PASSWORD');
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.loginButton).toBeEnabled();
  });

//   test('should login with valid credentials', async ({ loginPage, page }) => {
//     await loginPage.goto();
//     await loginPage.login('your-email@domain.com', 'your-password');

//     // After successful login you land on Discovery Landscape
//     await expect(page).toHaveURL(/discovery-insights/);
//     await expect(page.getByRole('heading', { name: 'Discovery Landscape' })).toBeVisible();
//   });

//   test('should show error for invalid credentials', async ({ loginPage, page }) => {
//     await loginPage.goto();
//     await loginPage.login('wrong@email.com', 'wrongpass');

//     // Adjust the error locator once you see the real message
//     await expect(page.getByText(/invalid|incorrect|error/i)).toBeVisible();
//   });
});