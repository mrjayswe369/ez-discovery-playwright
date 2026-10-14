import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // More flexible locators
    this.emailInput = page.getByPlaceholder(/email/i).or(page.locator('input[type="email"], input[placeholder*="Email" i]')).first();
    this.passwordInput = page.getByPlaceholder(/password/i).or(page.locator('input[type="password"]')).first();
    this.loginButton = page.getByRole('button', { name: /login/i });
  }

  async goto() {
    await this.page.goto('/login', { waitUntil: 'networkidle' });
    await expect(this.loginButton).toBeVisible({ timeout: 15000 });
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}