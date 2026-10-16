
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// GitHub-injected values are authoritative; CI must not depend on a local .env.
if (!process.env.CI) dotenv.config({ quiet: true });

export default defineConfig({
  testDir: './tests',

  // Execute independent tests in parallel
  fullyParallel: true,

  // Prevent accidental test.only in CI
  forbidOnly: !!process.env.CI,

  // Keep failures visible; no automatic retries.
  retries: 0,

  // Control parallel workers
  workers: process.env.CI ? 1 : undefined,

  // Test reports
  reporter: [
    ['./reporters/PrivacyReporter.ts'],
    ['./reporters/DiscoveryLifecycleReporter.ts'],
    ['html', { open: 'never' }],
    ['list']
  ],

  use: {
    baseURL: process.env.BASE_URL,

    // Capture debugging evidence
    trace: process.env.CI ? 'off' : 'retain-on-failure',
    screenshot: process.env.CI ? 'off' : 'only-on-failure',
    video: process.env.CI ? 'off' : 'retain-on-failure',
  },

  // Cross-browser testing
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
