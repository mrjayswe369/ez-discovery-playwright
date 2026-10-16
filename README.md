# EZ Discovery Playwright automation

GitHub Actions uses the tag-based repeatable Chromium suite: `npm run test:ci`.
See [CI policy, exact configuration, security and execution status](docs/ci-cd.md).
DISC-001 is excluded from automatic runs; optional DISC-003 requires an approved
registered fixture and an existing pending attempt. NEX-007 remains a required gate.

Nexus NEX-001 through NEX-007: run `npm run test:nexus`.
See [Nexus architecture, contracts, privacy and coverage](docs/nexus-automation.md).
See [cluster uniqueness and fixture lifecycle](docs/cluster-uniqueness.md) for the
current business rule, prerequisites, execution results and reporting semantics.
Latest full Chromium run (16 October 2026): **11 passed, 1 failed, 1 BLOCKED,
0 skipped**, in 4m 14.464s. DISC-003 passed; DISC-001 lacks fresh data; NEX-007
reports differing enterprise totals from the API. The full regression is not green.

TypeScript page objects live in pages/ and are injected by fixtures/baseFixtures.ts.
The existing LoginPage and login flow are preserved. Shared dashboard assertions
live in tests/support/.

Copy .env.example to .env and supply the QA URL and credentials locally.

```powershell
npm run typecheck
npm run test:discovery
```

The discovery test creates a new manual workflow without Cluster ID, checks
DISCOVERY PENDING, opens that workflow, uploads a unique archive, waits for
processing, and validates a dynamically selected enterprise. It does not delete
workflows or edit enterprise data. Every explicit attempt has a new upload
filename. The cross-browser CI matrix excludes this state-changing test.

Cluster uniqueness is enforced by the server: once a workflow exists for a
cluster, that cluster cannot be discovered again. HTTP 400 with "Workflow already
exists for cluster" is the expected duplicate validation. Renaming a GZIP does
not change its cluster. DISC-001 accepts only approved fresh data; DISC-003 alone
expects duplicate rejection. Cluster identifiers and archive contents are never
edited to bypass this rule.

Source configuration in .env (see .env.example):

- DISCOVERY_SOURCE_DIR resolves relative filenames; use an absolute source filename otherwise.
- DISCOVERY_CLIENT_ID defaults to 018204 and must be numeric.
- DISC-001 requires DISCOVERY_FRESH_SOURCE_FILE, DISCOVERY_FRESH_CLUSTER_ID and DISCOVERY_FRESH_APPROVED=true.
- DISC-003 requires DISCOVERY_REGISTERED_SOURCE_FILE and DISCOVERY_REGISTERED_CLUSTER_ID.
- DISCOVERY_DUPLICATE_ATTEMPT_WORKFLOW names an automation-owned empty pending workflow (Auto_Duplicate by default).
- The legacy DISCOVERY_SOURCE_FILE setting is not used as implicit fresh data.

Missing fresh prerequisites block DISC-001 before login, creation or upload. A
configured fresh cluster is also checked against existing workflows before
creation. Fresh archive/cluster/environment combinations are atomically reserved
in ignored .discovery-fixture-state/ before use. Reservations persist after any
attempt to prevent unsafe reuse; changing the last four filename digits does not
reset freshness. An aborted attempt needs explicit operator reconciliation with
server state before a reservation is deliberately reset. Never reset an accepted
fixture merely to rerun the positive test.

Playwright has no native BLOCKED status. Prerequisite errors carry a BLOCKED
annotation and remain non-green with a nonzero exit, while the lifecycle reporter
separates BLOCKED from functional FAIL in
test-results/discovery-lifecycle-summary.json. No prerequisite is silently skipped
or accepted as a successful end-to-end journey.

The fixture copies the supplied .json.gz archive directly into the OS temporary
directory. It never decompresses, recompresses or changes archive contents. Only
the last four numeric filename digits before .json.gz change; all earlier digits,
the client ID, Provision identifier and extension stay unchanged. For example,
..._043747.json.gz can become ..._041234.json.gz. SHA-256 verifies the compressed
archive bytes. Filename and archive hash are attached to the report. Teardown
removes temporary copies after success or failure; the original stays untouched.

The timestamp-based four-digit suffix is reserved atomically in the ignored
.discovery-upload-history/ directory, preventing reuse across runs/workers in this
checkout. Keep that directory between runs. Separate machines need to share or
persist that history to prevent cross-machine reuse. There are 9,999 alternative
suffixes per source name; exhaustion fails explicitly. The upload page object also
refuses repeated submission of the same filename.

For independent read-only dashboard coverage:

```powershell
npm run test:dashboard
```

DISC-002 dynamically selects an existing card with DISCOVERY COMPLETE status.
Set DISCOVERY_EXISTING_WORKFLOW only to override the selection with a specific
completed workflow name. A missing completed workflow or missing credentials fails
with a clear error; neither condition skips the test. DISC-002 does not use the
upload fixture and asserts that it sent no workflow creation or upload requests.
DISC-001 remains independent and retains its existing creation/upload flow.

Run `npm run test:duplicate` for DISC-003. The inspected application accepts an
empty workflow without Cluster ID, then rejects the registered cluster during
the automatic multipart upload. DISC-003 reuses its named empty pending workflow,
creating it once only when absent. It uploads one byte-identical GZIP copy and
asserts HTTP 400, the duplicate message and identified cluster, a visible UI error,
unchanged workflow membership and metadata, no duplicate completed workflow, and
unchanged full registered discovery-insights fingerprints. It leaves the pending
attempt in place for reuse and never deletes existing data. Run archive-dependent
tests with one worker; CI excludes DISC-001 and DISC-003 from its read-only matrix.

Enterprise counts are compared with
tiles in the active filter. Counts must be finite nonnegative numbers; no counts
from screenshots are hardcoded. The dashboard name and Business Name must match
the selected tile. The current dashboard does not expose an E-ID field; the ID is
validated on the tile and recorded in the report. Charts with data must render
SVG series and meaningful licensing percentages. Explicit No data to display
states are annotated. Report options are opened and checked; the CRM control is
checked without creating a lead.

The upload starts automatically when a valid archive is selected. Processing waits
use observable controls and tiles with bounded Playwright waits, without fixed sleeps.
For DISC-001, a backend cluster conflict is a failed positive journey; supply an
application-approved unused-cluster fixture for a later run. DISC-003 expects that
specific rejection, but only passes when its data-preservation assertions pass.

Failure screenshots, videos, traces and upload metadata are retained under
test-results/. The HTML report is in playwright-report/. Upload rejection fails
the test with the backend status/message. Keep reports and traces private because
they can contain authenticated network traffic. Credentials, generated payloads
and reports are ignored by Git.

Historical regression: DISC-002 skip fix (October 15, 2026)

DISC-002 previously called test.skip when DISCOVERY_EXISTING_WORKFLOW was absent.
That variable is now an optional name override. Without it, the test selects a
visible DISCOVERY COMPLETE card, verifies its status, and runs every existing
dashboard assertion. Missing credentials or a missing completed workflow fail
explicitly. The login credential guard also fails rather than skipping.

Commands executed:

```powershell
npx tsc --noEmit
npx playwright test --project=chromium --workers=1
```

TypeScript passed. The final Chromium regression passed all five tests with zero
failures and zero skipped tests in 1 minute 12.391 seconds (command wall time):

- DISC-001: 33.0 seconds.
- DISC-002: 12.5 seconds, reusing an existing completed workflow; no creation/upload requests.
- Login page validation: 5.9 seconds.
- Valid login: 7.8 seconds.
- Invalid login: 7.2 seconds.

DISC-001 and the Gzip fixture were not changed for this fix. Gzip uploads remain
compressed and only the final four filename digits change. No Nexus automation or
JSON content validation was added.

Data limitation: a standalone diagnostic run selected the legacy verticals test
workflow and failed because its dashboard omitted Sites & Location. The assertion
was retained. The completed workflow reused in the final regression exposed all
required metrics and passed. Standalone DISC-002 still requires an existing
completed workflow with the required dashboard data; it never creates one itself.

Earlier validation record (October 15, 2026):

The browser results below precede the subsequent archive-only/four-digit naming
change. That fixture change is checked locally without another QA upload.

- TypeScript type checking and Git whitespace checks passed.
- All three existing Chromium login tests passed.
- The complete DISC-001 Chromium journey passed in 39.9 seconds for Auto_v9ftgl0,
  including upload, processing, dynamic enterprise selection and all shared dashboard checks.
- The independent DISC-002 read-only dashboard test passed in 17.9 seconds against
  that same completed workflow.
- Earlier attempts exposed ZIP/Gzip-only validation, an HTTP 400 cluster conflict,
  automatic upload on file selection, partially rendered enterprise lists,
  whitespace in metric values, and zero-height chart bars. Automation was adjusted
  from the actual DOM, network trace and failure reports. Backend failures remain
  test failures, not accepted outcomes.
- A separate legacy dashboard lacked Sites & Location; its test correctly failed.
- A read-only check for an older workflow failed because that name was absent from
  the latest QA workflow list. Use a currently listed completed workflow name.

These historical results precede the confirmed cluster-uniqueness contract and
the explicit fixture separation above. They do not establish that a previously
accepted archive can be processed again. See the current lifecycle execution
record for present test-data blockers.
