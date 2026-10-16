# Nexus Summary Board automation

Run `npm run test:nexus` for the seven independent Chromium Nexus scenarios.
Run `npx tsc --noEmit` and `npx playwright test --project=chromium --workers=1`
for the complete suite, including Nodes/login tests and DISC-003 duplicate
validation. See [cluster uniqueness](cluster-uniqueness.md) for the current
prerequisites and latest full-regression result; the execution below records the
earlier Nexus implementation run.

Nexus requires only BASE_URL, TEST_EMAIL and TEST_PASSWORD. It has no Windows
archive dependency. NEXUS_DEFAULT_DEPLOYMENT optionally changes the expected
default deployment (Lab by default). An existing completed discovery dataset is
required for cluster and populated-table interaction coverage. Missing access or
contract fields fails explicitly; tests never skip those errors.

## Confirmed execution: 16 October 2026

This historical execution was **not a clean full regression**. TypeScript validation
passed, and all seven Nexus tests passed. The existing upload test was blocked by
backend validation, so the five-test baseline is not claimed green for this run.

| Execution | Passed | Failed | Skipped | Duration |
| --- | ---: | ---: | ---: | --- |
| Targeted NEX-005 after SVG hover fix | 1 | 0 | 0 | 30.3 seconds |
| Nexus subset in final full run, NEX-001 through NEX-007 | 7 | 0 | 0 | Included below |
| Existing subset: DISC-001, DISC-002 and three login tests | 4 | 1 | 0 | Included below |
| Complete Chromium regression | 11 | 1 | 0 | 4 minutes 18.884 seconds |

Commands: `npx tsc --noEmit`, then
`npx playwright test --project=chromium --workers=1`.
Combined command wall time, including TypeScript checking, was 4 minutes
37.639 seconds. The HTML report confirms twelve tests, eleven expected results,
one unexpected result, zero flaky results and zero skips.

DISC-001 failed when the multipart upload returned HTTP 400, **Workflow already
exists for cluster**. The error context, failure screenshot and trace agree.
The source archive identifies an already discovered cluster; changing its final
four filename digits does not change that cluster. No identifiers were edited,
no existing data was deleted, and no further upload retry was made to hide this
failure. The attempt created workflow `Auto_vahrpm4`, which was left in place.
DISC-002 reused completed data and passed without creating or uploading anything.
The original 36,438-byte GZIP retained its original modification time, and the
temporary archive directory was cleaned up.

A supported archive identifying a cluster not already present, or a documented
application contract permitting repeat discovery, is required before another
full run can satisfy the clean-regression criterion. The existing DISC-001
implementation was preserved.

Current report annotations explicitly mark Prod deployment, licensing slice
sizes, licensing-to-user relationships, independent churn/migration policy, and
provisioning-source/table accuracy as NOT VALIDATED. One reseller row was present
and its aggregate total agreed; reseller View All was not offered. Earlier
empty-reseller observations must not be mistaken for the current dataset.
Firefox, WebKit and GitHub Actions were not executed on this workstation.

Local artifacts: `playwright-report/index.html`, `test-results/`, and the ignored
`nexus-regression-run.log`. Legacy DISC-001 diagnostics retain the existing local
privacy policy and should not be published as sanitized Nexus artifacts.

## Architecture decisions

The existing POM and lazy fixtures are retained. The Gzip fixture, login flow,
DISC-001 and DISC-002 behavior are unchanged by the Nexus implementation.

| File | Responsibility |
| --- | --- |
| pages/NexusPage.ts | UI locators, navigation, Material dropdowns, KPI extraction, SVG/heatmap extraction, row-span normalization and table interactions; no assertions |
| api/NexusApiEvidence.ts | Observe the eleven read-only aggregate responses caused by a UI action, validate their runtime shapes, and retain only the aggregate fields needed for comparisons |
| models/dashboard.ts | Typed Nexus/enterprise metrics, chart series, table rows, filter selections and PASS/FAIL/NOT VALIDATED results; strict numeric parsing |
| fixtures/nexusFixtures.ts | Inject objects and manage per-test read-only guards and private diagnostics; login and business validation stay in test steps |
| tests/support/nexusAssertions.ts | Web-first readiness checks, KPI/API comparisons and explicit chart-presentation mappings |
| tests/nexus.spec.ts | Seven independent scenarios with descriptive steps and local state |
| reporters/PrivacyReporter.ts | Redact automatic record snapshots and configured credential strings before the HTML reporter copies attachments |
| scripts/sanitize_nexus_trace.py | Python 3 standard-library sanitization of failure traces; no third-party package required |

The new documentation is `docs/nexus-automation.md`. Existing files changed for
this feature are `playwright.config.ts`, `tsconfig.json`, `package.json`,
`.env.example`, `README.md`, and `.github/workflows/playwright.yml`. No existing
Nodes page object, specification, base fixture or Gzip implementation was changed.

There is no new base page, generic helper class, shared authentication file, global
test state or test-order dependency. Each Nexus scenario logs in independently and
captures the responses from its own UI actions. Waiting begins before each action;
all aggregate responses must succeed before scoped values are compared. Equal
values after changing a filter are valid: request scope and response agreement,
not inequality with the previous display, prove filtering.

The inspected UI uses an accessible Nexus radio and Angular Material combobox and
option roles. The filter controls lack accessible labels, and chart/table sections
lack roles or test IDs. Those locators therefore use observed component containers
plus exact visible labels. Generated Material IDs, Angular ng-reflect properties,
XPath, and positional dropdown indexes are not used by Nexus. SVG inspection is
coupled to ApexCharts rendering; product-owned test IDs or accessible chart data
would reduce that coupling.

Tooltip interaction chooses the largest positive rendered value so a subpixel bar
does not become the pointer target. It then uses SVG fill geometry and browser
hit testing to find an actual interior point, including for donut slices whose
bounding-box centers can lie in the hole. It does not force events or omit small
values from the data comparisons.

Opportunity rows use rowspan and hide redundant continuation cells. The extractor
resolves the logical grid before validating header/row widths and numeric columns.
View All scrolling targets actual scroll containers, not a moving last row in an
infinite list. Search uses a currently displayed record and verifies matching rows
and restoration after clearing; an exhaustive no-match search across every remote
opportunity page is deliberately outside these scenarios.

## Inventory

| ID | Functional checks | Data checks |
| --- | --- | --- |
| NEX-001 | Nodes to Nexus, Summary Board, defaults, twelve section containers, no loading/errors | Default request filter scope |
| NEX-002 | All twelve labels, formatting, integer counts, nonnegative values, EOL percentage range | UI/API agreement for all twelve metrics |
| NEX-003 | Every available deployment including Lab/Prod when offered, selected value, rendered charts | All aggregate requests use that deployment; KPI values match those responses |
| NEX-004 | Dynamic cluster selection and return to All | Scoped request parameters and KPI/UI agreement for both selections |
| NEX-005 | Seven charts, numeric series, categories, legends, supported tooltips and legitimate empty states | Six chart series compared with scoped API evidence; licensing center compared with classified total |
| NEX-006 | Five table headers and logical row structures, numeric cells, Group/User filters, available View All, scrolling and positive search | Reseller empty state backed by API; row-level provisioning truth explicitly NOT VALIDATED |
| NEX-007 | Enterprise-size, device-model, trunk and reseller totals, scoped chart consistency | Aggregate row partitions against their corresponding totals and the actual rendered enterprise-size slices |

## Observed contracts and validation boundaries

The initial implementation was inspected against F.v1.148.0/B.v1.145.0. Endpoints
are under `/discovery/workflow/platform-summary/`, plus the existing API spelling
`ai-oppurtunity-summary` and `ai-oppurtunity-features`. Only these read-only POSTs
and workflow/list are permitted by the Nexus route guard. Other discovery writes
are aborted and fail an explicit after-test assertion. No provisioning files are
uploaded, decompressed or parsed by Nexus.

The response schema, not screenshot counts, supplies expected values. All twelve
metrics have UI/API comparisons. Devices EOL is the rounded percentage of API
eolDevices divided by API devices. Churn risk uses score >=30 and migration ready
uses score >=50 in the inspected client code. Their UI/API transformation is
checked, but independent business-policy correctness is NOT VALIDATED.

Chart mappings are intentionally explicit:

- Enterprise-size slices use category counts.
- EOL Exposure orders vendors by their summed scoped percentages and caps its
  preview. Its renderer adds a transparent zero-valued dummy series.
- Feature Breadth Index rounds averageFeaturesPerUser. The distributed renderer
  produces one-hot category series and a transparent zero series; those zeros are
  included in expected values rather than silently discarded.
- Endpoint Adoption normalizes each pair of scoped device counts to rounded
  percentages, then adds a transparent zero series. It is not a count-valued SVG.
- Knowledge Worker Exclusive uses LOW, MEDIUM, HIGH and APPROPRIATE in the
  inspected band order. Zero-height bars remain legitimate data.
- Top AI Upgrade Targets is a heatmap: numeric values are on rect elements, not
  just paths. Percentages are compared with the API's category percentages.
- The licensing donut inflates small visual slices. Its SVG areas are not raw
  license counts. The center total is checked against totalClassified, and legend
  percentages are range-checked; slice-area accuracy is NOT VALIDATED.

Feature Distribution User values are adoption ratios and Group values are counts.
The parser accepts `<1`. A value over 100 is not rejected merely because a header
contains (%); no undocumented business bound is invented.

Comparison attachments distinguish PASS (the stated independently observed API
value agrees), FAIL (actual differs), and NOT VALIDATED (no independent source or
confirmed rule). Functional presence/format assertions never stand in for data
accuracy. UI/API consistency does not establish that backend aggregates correctly
represent provisioning records. Future source adapters can use the typed models;
there are no speculative `.json.gz` field mappings or new JSON validation.

## Reporting, privacy and CI

Automatic screenshots, videos and raw report traces are disabled for Nexus and
CI. The shared privateDiagnostics fixture sanitizes failure action traces,
including authentication actions: no console, network, DOM, dynamic titles,
parameters, results or source payloads are retained. Raw archives are removed
even if sanitization fails. Masked screenshots cover credentials and record data.
Python 3 must be available; set PYTHON_COMMAND locally if its executable has a
different name. CI supplies Python and audits diagnostics before uploading them.

The privacy reporter removes automatic record snapshots and masks configured
credentials in error messages for Nexus, and for all tests in CI. Legacy identity
attachments are withheld in CI. Existing Nodes screenshots/videos are disabled in
CI, and the workflow disables their raw traces. Sanitized Nexus diagnostics remain
available. Local legacy Nodes failure traces retain the existing private policy;
do not publish them without a separate security review.

The three local browser project definitions remain intact. The current required
CI gate runs Chromium using explicit tags, with DISC-001 always excluded and
DISC-003 available only through approved manual opt-in with a reusable pending
attempt. The full local Chromium regression still includes DISC-001. Default CI
needs only URL/login secrets and no local Windows archive path. See ci-cd.md for
the latest workflow, security policy, configuration and actual remote status.

## Coverage gaps and next improvements

Availability is recorded per run. Prod requires a Prod option/data; populated
reseller interactions require reseller records. Neither is fabricated for coverage.
The licensing/user relationship, invalid or overlapping combinations, churn and
migration business-policy definitions, and provisioning-to-table accuracy need
product-approved contracts or source data. Broader chart drilldowns require a
visible More control; tooltips are covered where a positive point exists.

Recommended next steps: add product test IDs and accessible filter labels, approve
the aggregate business definitions, supply stable read-only Lab/Prod/reseller
datasets, then implement versioned source-data adapters after inspecting the
approved provisioning schema. Validate Firefox/WebKit execution and CI separately
from the Chromium results reported here.
