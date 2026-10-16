# Cluster uniqueness and discovery test-data lifecycle

The confirmed business rule is one discovery per cluster once a discovery
workflow exists. A new uploaded filename does not make a cluster new. The
observed application creates an empty manual workflow without Cluster ID, then
validates the cluster from its provisioning archive during multipart
`POST /discovery/workflow/:id/create-insight`. Duplicates return HTTP 400 with
`message: Workflow already exists for cluster` and the cluster name in `error`.
This is an expected rejection only in DISC-003, never a positive DISC-001 pass.

## Independent datasets

| Scenario | Typed data | Required environment configuration | Lifecycle |
| --- | --- | --- | --- |
| DISC-001 positive end-to-end | FreshClusterDataset | DISCOVERY_FRESH_SOURCE_FILE, DISCOVERY_FRESH_CLUSTER_ID, DISCOVERY_FRESH_APPROVED=true | Operator-approved archive/cluster mapping; check current workflow inventory before creation; reserve once locally; never manufacture identifiers |
| DISC-003 duplicate rejection | RegisteredClusterDataset | DISCOVERY_REGISTERED_SOURCE_FILE, DISCOVERY_REGISTERED_CLUSTER_ID | Require a completed workflow for that cluster; use its valid approved archive; rotate only filename suffix |
| DISC-003 upload destination | RegisteredClusterDataset.attemptWorkflowName | DISCOVERY_DUPLICATE_ATTEMPT_WORKFLOW (default Auto_Duplicate) | Reuse one dedicated empty pending workflow; create only when absent; block if its name is ambiguous or it contains data |
| DISC-002 existing dashboard | ExistingWorkflowDataset | Optional DISCOVERY_EXISTING_WORKFLOW override | Dynamically select completed data otherwise; no creation/upload fixture |
| NEX-001 through NEX-007 | Existing environment aggregates | Existing URL/login configuration | Read-only; unchanged Nexus fixtures, page objects and assertions |

Relative archive names require DISCOVERY_SOURCE_DIR. Absolute names work without
it. DISCOVERY_CLIENT_ID remains numeric and defaults to 018204. The old
DISCOVERY_SOURCE_FILE setting cannot implicitly opt an archive into fresh use.
Configuration never opens/decompresses JSON to infer or modify cluster IDs;
the operator is responsible for the approved archive-to-cluster mapping.

Both upload roles verify the GZIP magic header, copy bytes without
decompression/recompression and verify SHA-256. Each submission uses a
timestamp-based reserved final-four-digit suffix.
The source, client prefix, Provision identifier and all earlier filename digits
are preserved. Temporary copies are cleaned up. Ignored filename reservations
persist between runs to prevent duplicate filenames in this checkout.

Fresh dataset identity includes environment URL, client, declared cluster and
compressed archive SHA-256. Its atomic local reservation persists even after an
aborted attempt, conservatively blocking reuse until the operator reconciles
server state. It is not a distributed registry: independent machines must share
or coordinate fresh-fixture allocation. Server-side validation remains the final
authority. Two workers must not share a duplicate-attempt destination either;
the provided duplicate command uses one worker. Default CI excludes archive cases;
approved manual CI may select DISC-003 in reuse-only mode. See ci-cd.md.

## Assertions and preservation evidence

DISC-003 observes workflow-list responses caused by UI actions; it does not replay
tokens or write through APIs. Before upload, it fingerprints existing workflow
metadata and the entire registered discovery-insights response. That response
contains cluster metrics, device/feature matrices, enterprise list, resellers and
workflow/provisioning references. JSON object keys are canonicalized; array
ordering and all values are retained in the hash. Comparison attachments contain
hashes and counts rather than raw records. Local Nodes failure screenshots and
traces retain the existing private diagnostic policy; do not publish them as
sanitized Nexus artifacts.

After one upload it verifies HTTP/statusCode 400, exact duplicate message, the
expected cluster, a visible rejection, and absence of Continue. A fresh workflow
list must have identical membership to the pre-upload baseline, unchanged
completed membership and pre-existing workflow metadata, exactly the original
registered cluster workflow, and an empty pending attempt. Reopened registered
insights must have an identical full fingerprint and visible enterprise tiles.
An unexpected mutation request is aborted; only one create-insight upload to the
dedicated pending ID and, if needed, one empty workflow creation are permitted.

This is API-observable preservation, not a database transaction audit or a check
of every underlying provisioning record. Concurrent manual edits or discoveries
can cause real comparison failures; use a controlled QA window. The test does not
weaken those checks or delete the attempt to manufacture an unchanged inventory.

## Reporting and execution

Missing/consumed fresh data raises TestDataPrerequisiteError with a BLOCKED
annotation. Playwright has no native BLOCKED result: its native result remains
failed with a nonzero exit, while DiscoveryLifecycleReporter writes a separate
functional/expected-rejection inventory and PASS/FAIL/BLOCKED/SKIPPED counts to
the run's output directory as discovery-lifecycle-summary.json. Assertions and
unknown failures are not reclassified as prerequisites. No test is skipped and
no rejected upload is substituted for DISC-001's positive journey.

```powershell
npx tsc --noEmit
npm run test:duplicate
npm run test:nexus
npx playwright test --project=chromium --workers=1
```

The full command intentionally remains non-green when fresh data is unavailable;
the other scenarios still execute. DISC-001 and DISC-003 have zero retries.
CI uses explicit tags for the required Chromium suite, excludes DISC-001 and
permits DISC-003 only by approved manual opt-in using an already pending attempt.
Chromium/Firefox/WebKit local projects remain available. Default CI does not need
local archives or Windows paths. See ci-cd.md for the current policy and results.

## Files changed for this rule

- Added fixtures/discoveryData.ts: typed purpose-specific configuration and prerequisite errors.
- Added api/DiscoveryApiEvidence.ts: UI-triggered inventory and canonical preservation fingerprints.
- Added tests/discovery-duplicate.spec.ts: independent DISC-003 business validation.
- Added tests/support/discoveryPrerequisites.ts: explicit in-test BLOCKED reporting.
- Added reporters/DiscoveryLifecycleReporter.ts: separate prerequisite/result summary.
- Updated fixtures/baseFixtures.ts and fixtures/discoveryFile.ts: lazy purpose-specific data, immutable archive copies and fresh reservations.
- Updated pages/DiscoveryUploadPage.ts: typed submission result separate from positive acceptance policy.
- Updated DISC-001 prerequisite guard and DISC-002 typed read-only configuration; existing dashboard assertions remain intact.
- Updated playwright.config.ts, package.json, .env.example, .gitignore and CI selection.
- Updated README and Nexus documentation; local .env contains registered-fixture configuration only in addition to existing secrets, and remains ignored.

## Execution record: 16 October 2026

- TypeScript validation passed after implementation and before the final run.
- Targeted DISC-003 passed in 23.4 seconds (20.0-second test body). It reused the
  pending attempt, issued one duplicate upload, received the documented HTTP 400,
  and passed every before/after preservation assertion.
- Targeted Nexus: 6 passed, 1 failed, 0 skipped in 2.7 minutes. NEX-001 through
  NEX-006 passed. NEX-007 retained its existing consistency assertions and exposed
  differing API totals: enterprise-category.totalEnterprises and its category sum
  were 2,669, while summary-cards.enterprises was 2,676.
- A separate read-only capture reproduced those values with identical
  platform=broadworks, cluster=all, deploymentType=lab request scopes. The category
  response had no unclassified bucket. This is not a locator failure; the backend
  data/aggregate contract needs clarification. Nexus assertions were not removed
  or changed to force green results.

Final command: `npx playwright test --project=chromium --workers=1`.

| Result group | Passed | Failed | BLOCKED | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Functional scenarios (login, DISC-001/002, Nexus) | 10 | 1 | 1 | 0 |
| Expected duplicate rejection (DISC-003) | 1 | 0 | 0 | 0 |
| All thirteen scheduled tests | 11 | 1 | 1 | 0 |

Full Playwright duration: **4 minutes 14.464 seconds**. Command wall time including
TypeScript checking: **4 minutes 31.318 seconds**. Native Playwright reports
11 passed and 2 failed because it has no BLOCKED status; the lifecycle summary
identifies the prerequisite error separately. Runner exit remains 1. There were
zero flaky results and zero skipped tests.

- DISC-003 passed again in 28.6 seconds: one rejected upload, zero workflow
  creations, two completed workflows before and after, and identical registered
  insights SHA-256 values. The automation-owned Auto_Duplicate pending workflow
  was initialized during targeted validation and retained for reuse. No completed
  workflow was created and no existing workflow was deleted.
- DISC-001 was BLOCKED in fixture setup: DISCOVERY_FRESH_SOURCE_FILE is missing.
  No fresh source/cluster/approval was inferred from registered data. Its failure
  trace contains **zero network requests**, proving no login, creation or upload
  occurred. Its successful end-to-end journey is **not validated** in this run.
- DISC-002 and all three login tests passed. DISC-002 remained read-only.
- NEX-001 through NEX-006 passed; NEX-007 failed again with the same API/category
  total discrepancy. All Nexus scenarios remained read-only and their assertions
  remain unchanged. The requirement that all seven pass is **not met** with the
  current backend data/contract.
- Original GZIP remains 36,438 bytes with its original modification time. There
  are no remaining discovery temporary directories or raw Nexus trace archives.

Artifacts: `playwright-report/index.html`,
`test-results/discovery-lifecycle-summary.json`, and ignored
`cluster-uniqueness-regression.log`. Structured duplicate evidence in the HTML
report records upload/creation counts, completed counts and before/after hashes.

The implementation is in place, but a complete green end-to-end regression is
not claimed. Remaining prerequisites are an approved archive for a genuinely
unused cluster, plus resolution or an approved explanation of the differing
Nexus enterprise totals. The fresh positive path and fresh-reservation lifecycle
have not been exercised against a live unused-cluster fixture. Firefox, WebKit
and CI were not executed for this change.
