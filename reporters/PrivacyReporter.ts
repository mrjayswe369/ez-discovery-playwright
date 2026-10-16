import { readFileSync, writeFileSync } from 'node:fs';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/** Redacts automatic page snapshots before the HTML reporter copies attachments. */
export default class PrivacyReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult): void {
    if (!process.env.CI && !test.tags.includes('@nexus')) return;
    const secrets = [process.env.TEST_EMAIL, process.env.TEST_PASSWORD, process.env.BASE_URL,
      process.env.DISCOVERY_REGISTERED_CLUSTER_ID, process.env.DISCOVERY_REGISTERED_SOURCE_NAME]
      .filter((value): value is string => Boolean(value));
    const archiveStem = process.env.DISCOVERY_REGISTERED_SOURCE_NAME?.replace(/\d{4}\.json\.gz$/, '');
    if (archiveStem) secrets.push(archiveStem);
    if (process.env.CI) {
      for (const attachment of result.attachments) {
        if (!['selected-enterprise', 'existing-completed-workflow'].includes(attachment.name)) continue;
        const value = attachment.body?.toString('utf8') ?? (attachment.path ? readFileSync(attachment.path, 'utf8') : '');
        if (attachment.name === 'existing-completed-workflow') { if (value) secrets.push(value); }
        else {
          const identity: unknown = JSON.parse(value);
          if (identity && typeof identity === 'object') {
            for (const field of Object.values(identity)) if (typeof field === 'string' && field) secrets.push(field);
          }
        }
      }
    }
    const redact = (value: string): string => secrets.reduce((text, secret) => text.split(secret).join('[REDACTED]'), value);
    if (process.env.CI) {
      const redactSteps = (steps: TestResult['steps']): void => {
        for (const step of steps) { step.title = redact(step.title); redactSteps(step.steps); }
      };
      redactSteps(result.steps);
      for (const annotation of test.annotations) if (annotation.description) annotation.description = redact(annotation.description);
    }
    for (const error of result.errors) {
      if (error.message) error.message = redact(error.message);
      if (error.stack) error.stack = redact(error.stack);
      // Recent Playwright versions may also embed an assertion snapshot in the error itself.
      if ('errorContext' in error) delete error.errorContext;
    }
    for (const attachment of result.attachments) {
      if (attachment.name === 'error-context' && attachment.path) {
        const content = readFileSync(attachment.path, 'utf8');
        const withoutSnapshots = content
          .replace(/# Page snapshot[\s\S]*?(?=# Test source|$)/, '# Page snapshot\n\n[Record data withheld; see masked screenshot and aggregate comparisons.]\n\n')
          .replace(/```yaml[\s\S]*?```/g, '[Automatic record snapshot withheld]');
        writeFileSync(attachment.path, redact(withoutSnapshots));
      }
      if (process.env.CI && ['selected-enterprise', 'existing-completed-workflow',
        'registered-upload-metadata', 'discovery-upload-metadata'].includes(attachment.name)) {
        const replacement = '[Validated record identity withheld from CI artifacts]';
        if (attachment.path) writeFileSync(attachment.path, replacement);
        if (attachment.body) attachment.body = Buffer.from(replacement);
      }
    }
  }
}
