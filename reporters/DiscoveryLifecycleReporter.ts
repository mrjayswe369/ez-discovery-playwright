import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite } from '@playwright/test/reporter';

/** Playwright has no native BLOCKED status. Keep its nonzero exit and report prerequisites separately. */
export default class DiscoveryLifecycleReporter implements Reporter {
  private suite?: Suite;
  private outputDirectory = '';

  onBegin(config: FullConfig, suite: Suite): void {
    this.suite = suite;
    this.outputDirectory = config.projects[0].outputDir;
  }

  async onEnd(result: FullResult): Promise<void> {
    // --list invokes reporters without executing tests; it is not an execution result.
    if (!this.suite?.allTests().some(test => test.results.length > 0)) return;
    const tests = (this.suite?.allTests() ?? []).map(test => {
      const last = test.results.at(-1);
      const blocked = last?.status === 'failed' && last.errors.length > 0 &&
        last.errors.every(error => error.message?.includes('[BLOCKED: TEST DATA]'));
      return { title: test.title, project: test.parent.project()?.name, durationMs: last?.duration ?? 0,
        category: test.tags.includes('@duplicate-cluster') ? 'expected-duplicate-rejection' : 'functional',
        status: blocked ? 'BLOCKED' : last?.status === 'passed' ? 'PASS' : last?.status === 'skipped' ? 'SKIPPED' : 'FAIL',
        ...(blocked ? { reason: test.annotations.find(annotation => annotation.type === 'BLOCKED')?.description } : {}) };
    });
    const counts = { passed: tests.filter(test => test.status === 'PASS').length,
      failed: tests.filter(test => test.status === 'FAIL').length,
      blocked: tests.filter(test => test.status === 'BLOCKED').length,
      skipped: tests.filter(test => test.status === 'SKIPPED').length };
    await mkdir(this.outputDirectory, { recursive: true });
    await writeFile(path.join(this.outputDirectory, 'discovery-lifecycle-summary.json'),
      JSON.stringify({ runnerStatus: result.status, durationMs: result.duration, counts, tests }, null, 2));
    console.log(`\nLifecycle results: ${counts.passed} passed, ${counts.failed} failed, ${counts.blocked} BLOCKED, ${counts.skipped} skipped.`);
    if (counts.blocked) console.log('BLOCKED prerequisites remain non-green in Playwright; no successful journey is claimed.');
  }
}
