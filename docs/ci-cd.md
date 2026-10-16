# GitHub Actions: EZ Discovery quality gate

## Workflow and trust boundary

`.github/workflows/playwright.yml` runs on pushes to main, pull requests targeting
main, and manual dispatch. One Ubuntu 24.04 job installs locked npm dependencies,
checks TypeScript, verifies trace privacy and test discovery, installs Chromium,
validates QA configuration, runs the approved suite, audits artifacts, cleans up
the optional private archive, writes a summary, and uploads safe diagnostics.

Node.js 24 LTS and Python 3.13 are configured explicitly. Official checkout,
setup-node, setup-python and upload-artifact actions are pinned to verified v6
commit SHAs. The npm lockfile is retained; no new npm dependencies are introduced.
Chromium is the required CI gate. Firefox/WebKit project definitions remain
available locally; this change does not claim their execution.

The token has contents:read only and checkout does not persist Git credentials.
Every event uses the same repository concurrency group, ez-discovery-qa, with
cancel-in-progress:false. This serializes active executions across branches/events
without aborting an active upload. GitHub can replace older pending runs with a
newer pending run; this is not a FIFO queue. It does not serialize local executions
or other repositories, which must coordinate QA use separately.

The job references the qa environment. Configure environment review/deployment
rules and branch protection deliberately: require the Required repeatable Chromium
regression check and restrict who can approve code receiving QA credentials.
The workflow uses pull_request, never pull_request_target. Fork/Dependabot runs
without QA secrets fail the prerequisite stage with configuration names and an
actionable explanation. Re-run reviewed code on a trusted branch with approved
environment access; do not expose QA secrets to fork code to make its check green.

## Explicit selection policy

| Family | Tags | Push/PR/default manual | Manual include_duplicate=true |
| --- | --- | ---: | ---: |
| Three login tests | @ci, @repeatable, @login, @read-only | 3 | 3 |
| DISC-002 | @ci, @repeatable, @existing-dashboard, @read-only | 1 | 1 |
| NEX-001 through NEX-007 | @ci, @repeatable, @nexus, @read-only | 7 | 7 |
| DISC-003 | @repeatable, @registered-data, @duplicate-cluster | Excluded | 1, approved prerequisites required |
| DISC-001 | @fresh-data, @stateful | Excluded | Excluded |

NEX-007 also has @consistency. `npm run test:ci` invokes the fixed Chromium,
one-worker, zero-retry policy in scripts/run-ci.cjs. Selection uses Playwright
details tags, not titles or filenames. Before execution the script discovers the
real inventory with the JSON reporter and checks family counts, the required
consistency case, repeatable tags and absence of fresh data. Intended inventory
changes must update scripts/ci-policy.cjs alongside test tags. The script only
accepts --list as an extra argument, preventing accidental policy overrides.

Default policy is eleven tests using @ci. Manual include_duplicate=true sets
CI_DUPLICATE_ENABLED=true and selects twelve using @ci|@registered-data. Missing
approved duplicate configuration fails before tests; it never silently downgrades
to eleven or skips DISC-003. CI's DISC-003 additionally requires its explicitly
named reusable empty pending workflow and cannot create one. Initialize it through
an authorized local duplicate run first. It must remain empty/pending and the
registered cluster must still have completed discovery data.

DISC-001 is never selected by this workflow because successful discovery consumes
a unique cluster. Its explicit local command and BLOCKED prerequisites remain
unchanged; a renamed GZIP never makes its underlying cluster fresh. Read
cluster-uniqueness.md before allocating new approved positive data.

## GitHub configuration

Prefer these **qa environment secrets**; repository secrets of the same names are
also supported. Values are never committed or printed.

| Secret | Purpose |
| --- | --- |
| BASE_URL | HTTPS QA application URL, reachable by the hosted runner |
| TEST_EMAIL | Approved automation account |
| TEST_PASSWORD | Automation account password |
| DISCOVERY_REGISTERED_GZIP_BASE64 | Optional manual DISC-003 only: base64 of the exact approved compressed archive, without decompression or content edits |

Use **repository Actions variables** for the following noncredential policy and
manifest fields. Avoid environment/job-expression precedence ambiguity by keeping
these at repository scope.

| Variable | Requirement/default |
| --- | --- |
| NEXUS_DEFAULT_DEPLOYMENT | Optional, Lab |
| DISCOVERY_EXISTING_WORKFLOW | Optional approved completed-workflow name; otherwise dynamic selection |
| DISCOVERY_CLIENT_ID | Optional numeric client prefix; existing default 018204 |
| CI_DUPLICATE_APPROVED | Required true only for manual duplicate selection; operator certifies fixture mapping and pending attempt |
| DISCOVERY_REGISTERED_SOURCE_NAME | Required for duplicate: approved plain original clientID_Provision_*.json.gz basename; no paths |
| DISCOVERY_REGISTERED_CLUSTER_ID | Required for duplicate: registered cluster matching that archive |
| DISCOVERY_REGISTERED_SHA256 | Required for duplicate: lowercase SHA-256 of the compressed source bytes |
| DISCOVERY_DUPLICATE_ATTEMPT_WORKFLOW | Required for duplicate: dedicated existing empty pending workflow name |

Do not configure fresh fixtures in this workflow. CI_DUPLICATE_ENABLED is derived
from the manual input, not a repository flag. The default suite requires no local
archive or Windows path. Python is supplied by setup-python; PYTHON_COMMAND is
only needed for local machines with a differently named Python executable.

The optional archive secret must fit GitHub's 48 KB limit after base64 encoding.
Larger archives need a separately reviewed private-download mechanism; none is
invented here and no archive is stored in Git. ci-prerequisites.cjs verifies the
manifest hash and GZIP header, writes the same bytes into a dedicated runner
temporary directory, and exports only its path/name to the test process. Cleanup
checks the resolved temporary boundary before recursive removal. Fixtures never
decompress, recompress, modify JSON identifiers or bypass server uniqueness.

CI filename allocation uses ten nonoverlapping suffix slots per GitHub workflow
run number, one per run attempt, skipping the original four-digit suffix. It
changes only the last four digits. It never wraps: more than ten attempts or
exhaustion of 9,999 alternatives fails explicitly. This allocation is scoped to
this workflow's run-number sequence. Allocate a dedicated approved CI source
filename/pool and coordinate it with local/other-workflow use; independent
allocators must not share an uncoordinated filename namespace. The local atomic
history is still checked. Do not rename/reset the workflow to reset this pool.

An authenticated repository administrator can configure secret values securely
using GitHub Settings or gh secret set's interactive/stdin input. Never place
values directly in committed YAML, shell command arguments, issue comments or
chat. This session's GitHub CLI was unauthenticated; secret/variable and protection
settings could not be reviewed or changed. Existing values are not claimed to be
absent, present or correct without authenticated evidence.

## Failure evidence and quality gate

Global retries are zero. The job is limited to 25 minutes and the test step to
15 minutes. Test assertions and the known NEX-007 hosted/category discrepancy are
preserved. There is no continue-on-error, expected-failure annotation or skip for
the discrepancy. A failing required test remains a failing job.

All CI tests and local Nexus tests share an auto fixture that records action
metadata without screenshots/DOM snapshots/sources, then sanitizes a failed
trace before attachment. Network events/resources, action params/results/errors,
dynamic titles and DOM are removed. Raw trace archives are removed in finally.
Masked failure screenshots cover inputs, tables, sidebar, enterprise identities
and details, workflow headings and text containing configured login secrets.
The privacy reporter redacts configured secrets in errors and masks known record
identities in CI step titles, annotations and identity attachments.

audit_ci_artifacts.py inspects report files, the embedded HTML report archive and
trace ZIPs before upload. Configured secret matches, raw resources or sensitive
trace fields fail the audit. Both artifact uploads require audit success; unsafe
diagnostics are withheld rather than uploaded. The allowlisted failure artifacts
are private-failure.png, private-trace.zip and discovery-lifecycle-summary.json,
plus the audited HTML report. The private provisioning directory is outside the
artifact roots. Retention is seven days. Masking and trace stripping deliberately
reduce debugging detail; aggregate comparison attachments remain available.

ci-summary.cjs publishes stage outcomes, selected policy, independent functional
and duplicate results, counts/duration, and nonpassing case titles. Missing test
results, an incomplete selected inventory, or any runtime skips fails its
completeness check. BLOCKED retains a nonzero native Playwright result; the
lifecycle report labels it separately. --list does not write fictional test
outcomes or create a listing-only HTML artifact. Prerequisite failures also emit
GitHub check annotations containing configuration names, never values. Other
failed steps retain failure even when diagnostics/summary succeed.

## Local validation and remote execution

Required checks: npm ci, npx tsc --noEmit, npx playwright test --list,
python scripts/test_trace_privacy.py, npm run test:ci -- --list, and the exact
npm run test:ci selection using CI=true with credentials injected from local .env.
Local credentials can be preloaded through dotenv into a child environment;
Playwright config intentionally does not read .env when CI is set. Never print
that environment. Validate optional selection with CI_DUPLICATE_ENABLED=true and
--list; this does not upload anything or prove optional fixture execution.

Local validation on 16 October 2026:

| Check | Actual result |
| --- | --- |
| npm ci | Passed; nine audited packages, zero reported vulnerabilities |
| npx tsc --noEmit | Passed |
| npx playwright test --list | 39 project cases: thirteen tests across the three retained browser projects |
| Default CI inventory | Exactly eleven Chromium tests; DISC-001/003 excluded; all seven Nexus cases present |
| Optional CI inventory | Exactly twelve Chromium tests; DISC-003 added; DISC-001 still excluded; listing only |
| Trace privacy unit checks | Two passed; includes removal of sensitive dynamic titles and raw cleanup on malformed input |
| Optional fixture preparation | Passed byte preservation, manifest validation, reuse-only export, guarded cleanup, wrong-hash rejection and allocation exhaustion checks; no upload |
| actionlint 1.7.12 | Passed; official downloaded binary checked against release SHA-256 manifest |
| Exact npm run test:ci under CI=true | **10 passed, 1 failed, 0 BLOCKED, 0 skipped; 151.055 seconds** |
| Artifact privacy audit | Passed on the actual failing run, including its masked image and sanitized trace |
| CI summary | Preserved the failing quality gate and recorded all eleven executed cases |

Local command wall time for the test step was 155.293 seconds. The only required
test failure was NEX-007: category slices/API category total 2,669 versus hosted
enterprises 2,676 for the same Lab/All scope. No expected metric, business assertion
or skip policy was changed to suppress this discrepancy. Default CI consumed no
fresh-cluster fixture and uploaded no GZIP. DISC-001 was excluded by policy, not
counted as a successful or blocked execution in this eleven-test run.

The GitHub job can additionally fail earlier if QA secrets, environment approval
or runner connectivity are unavailable. GitHub configuration/actual execution is
not inferred from local results. See the repository's Actions page for published
run status. This session could read public metadata but could not administer
secrets/variables/protection rules because gh was not authenticated. Optional
manual DISC-003 was not executed on a hosted runner; its secure transport/runtime
configuration still needs authenticated setup and live verification.

The first published run for commit 9a4f713,
[38867188877](https://github.com/mrjayswe369/ez-discovery-playwright/actions/runs/38867188877),
completed with failure at QA prerequisite validation. Hosted checkout, runtimes,
npm ci, TypeScript, privacy/inventory checks and browser installation passed;
application tests did not execute. Public metadata confirmed this outcome, while
job logs and secret/variable administration required authentication. A follow-up
fix prevents listing-only HTML artifacts and surfaces prerequisite annotations.
The public qa environment existed with no protection rules at inspection time;
an authenticated administrator must configure its reviewers/branch rules and
required secrets. No hosted regression PASS is claimed.

## Implementation inventory

- Updated .github/workflows/playwright.yml: triggers, stages, policy, least privilege, concurrency, diagnostics and summary.
- Updated test details tags in all five spec files; assertions remain intact.
- Updated playwright.config.ts: CI isolation from .env, zero retries and one worker; three browser projects retained.
- Updated fixtures/baseFixtures.ts and nexusFixtures.ts; added privateDiagnostics.ts for shared safe failure capture.
- Updated discoveryData.ts, discoveryFile.ts and DISC-003's prerequisite guard for reuse-only CI and allocated filename suffixes.
- Added ci-policy.cjs, run-ci.cjs, ci-prerequisites.cjs, cleanup-ci-fixture.cjs, ci-summary.cjs and audit_ci_artifacts.py.
- Added test_trace_privacy.py and hardened sanitize_nexus_trace.py; updated privacy and lifecycle reporters.
- Updated package.json scripts, .env.example, .gitignore and documentation.
- This commit also includes the previously uncommitted Nexus, discovery and login source changes from the authorized session. Their architecture/results are documented separately; generated outputs, credentials and archives are excluded.

## Primary references

- [Playwright tags](https://playwright.dev/docs/test-annotations)
- [GitHub concurrency](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency)
- [GitHub secrets and limits](https://docs.github.com/en/actions/reference/security/secrets)
- [Secrets and fork PR restrictions](https://docs.github.com/en/code-security/reference/secret-security/secret-types)
- [Node.js release status](https://nodejs.org/en/about/previous-releases)
