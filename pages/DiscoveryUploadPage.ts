import { Page, Locator } from '@playwright/test';
import { DiscoveryFile, validateDiscoveryFilename } from '../fixtures/discoveryFile';

export interface DiscoveryUploadResult {
  status: number;
  message?: string;
  error?: string;
  statusCode?: number;
  success?: boolean;
}

export class DiscoveryUploadPage {
  private readonly submittedFilenames = new Set<string>();
  readonly fileInput: Locator;
  readonly uploadButton: Locator;
  readonly continueButton: Locator;
  readonly duplicateClusterError: Locator;
  constructor(readonly page: Page) {
    this.fileInput = page.locator('input[type="file"]');
    this.uploadButton = page.getByRole('button', { name: 'Upload', exact: true });
    this.continueButton = page.getByRole('button', { name: 'Continue', exact: true });
    this.duplicateClusterError = page.getByText('Workflow already exists for cluster', { exact: true }).first();
  }

  async upload(file: DiscoveryFile): Promise<void> {
    const result = await this.submitFile(file);
    if (result.status < 200 || result.status >= 300 || result.success === false ||
        (result.statusCode !== undefined && result.statusCode >= 400) || result.error) {
      throw new Error(`Discovery upload backend validation failed (${result.status}): ${result.message ?? 'No validation message'}${result.error ? `; ${result.error}` : ''}`);
    }
  }

  async submitFile(file: DiscoveryFile): Promise<DiscoveryUploadResult> {
    validateDiscoveryFilename(file.filename, file.clientId);
    if (this.submittedFilenames.has(file.filename)) {
      throw new Error(`Refusing to upload the same filename twice: ${file.filename}`);
    }
    this.submittedFilenames.add(file.filename);
    const validationError = this.page.getByText(/File must be|invalid file|invalid.*filename/i).first();
    const responsePromise = this.page.waitForResponse(response => {
      const request = response.request();
      return request.method() === 'POST' &&
        (request.headers()['content-type'] ?? '').includes('multipart/form-data');
    }, { timeout: 120000 });
    // Actual DOM behavior: selecting a valid archive starts the upload automatically.
    const result = Promise.race([
      responsePromise,
      validationError.waitFor({ state: 'visible', timeout: 120000 }).then(async () => {
        throw new Error(`Discovery upload validation failed: ${await validationError.innerText()}`);
      }),
    ]);
    const [response] = await Promise.all([result, this.fileInput.setInputFiles(file.path)]);
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Discovery upload response must be a JSON object');
    const fields = body as Record<string, unknown>;
    for (const field of ['message', 'error']) {
      if (fields[field] !== undefined && typeof fields[field] !== 'string') throw new Error(`Upload ${field} must be a string`);
    }
    if (fields.statusCode !== undefined && typeof fields.statusCode !== 'number') throw new Error('Upload statusCode must be numeric');
    if (fields.success !== undefined && typeof fields.success !== 'boolean') throw new Error('Upload success must be boolean');
    return { status: response.status(), message: fields.message as string | undefined, error: fields.error as string | undefined,
      statusCode: fields.statusCode as number | undefined, success: fields.success as boolean | undefined };
  }

  async continueToDashboard(): Promise<void> {
    // Processing can either navigate automatically or expose Continue.
    await this.continueButton.or(this.page.locator('.enterprise-grid:visible')).first()
      .waitFor({ state: 'visible', timeout: 180000 });
    if (await this.continueButton.isVisible()) {
      await this.continueButton.click();
    }
  }
}
