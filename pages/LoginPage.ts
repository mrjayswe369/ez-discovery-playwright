
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page locators
    this.emailInput = page.getByPlaceholder(/email/i);
    this.passwordInput = page.getByPlaceholder(/password/i);
    this.loginButton = page.getByRole('button', {
      name: /log\s*in/i
    });
  }

  // Navigate to login page
  async goto(): Promise<void> {
    await this.page.goto('/login', {
      waitUntil: 'domcontentloaded'
    });
  }

  // Perform login action
  async login(
    email: string,
    password: string
  ): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
