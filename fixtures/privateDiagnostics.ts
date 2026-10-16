import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rm } from 'node:fs/promises';
import path from 'node:path';

/** Raw traces never become report attachments. Only masked images and action metadata leave the runner. */
export async function finishPrivateDiagnostics(page: Page, context: BrowserContext, info: TestInfo): Promise<void> {
  if (info.status === info.expectedStatus) {
    await context.tracing.stop();
    return;
  }
  if (!page.isClosed()) {
    const secrets = [process.env.TEST_EMAIL, process.env.TEST_PASSWORD].filter((value): value is string => Boolean(value));
    const screenshot = info.outputPath('private-failure.png');
    await page.screenshot({ path: screenshot, fullPage: true, mask: [
      page.locator('input, textarea, [contenteditable="true"], tbody, .sidebar-container'),
      page.locator('.enterprise-grid, .enterprise-header, .enterprise-details, .enterprise-name-text, .info-item .value, h3'),
      ...secrets.map(secret => page.getByText(secret, { exact: false })),
    ] });
    await info.attach('masked-failure-screenshot', { path: screenshot, contentType: 'image/png' });
  }
  const raw = info.outputPath('private-raw-trace.zip');
  const clean = info.outputPath('private-trace.zip');
  try {
    await context.tracing.stop({ path: raw });
    await promisify(execFile)(process.env.PYTHON_COMMAND ?? (process.platform === 'win32' ? 'python' : 'python3'),
      [path.resolve(__dirname, '../scripts/sanitize_nexus_trace.py'), raw, clean]);
    await info.attach('sanitized-action-trace', { path: clean, contentType: 'application/zip' });
  } finally { await rm(raw, { force: true }); }
}
