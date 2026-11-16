# Runtime Account Overview

Read-only `/api/user/self/acu-account-overview?days=1|7|30` aggregates authenticated
account consumption across all Keys, not the current log page or selected Key.
User-supplied user IDs are ignored; invalid day values use seven days. No schema,
retail charge, pricing, route selection or accounting writes were changed.

Amounts use decimal parsing of raw JSON scalars, preserving numeric/string
precision. Missing historical charges use the existing quota conversion. Pending
and unsettled records are not counted as paid consumption. Model grouping prefers
recorded canonical model identity, not the auto routing alias or provider retries.
Only required billing facts are projected from large log metadata; older database
versions retain the streaming fallback. The query has a bounded date range and
20-second cancellation deadline.

Comparison pairs finalized exact charges with their recorded CNY reference amount.
Official records take priority and are never mixed with platform/OpenRouter
benchmarks. Without official records, a single nonofficial source is labeled by
its actual type; ambiguous nonofficial sources suppress the comparison. Missing,
negative or zero reference values are excluded. Zero paid charges can compare;
negative savings remain negative rather than being clamped or advertised as a gain.

Focused model/controller tests cover account/date/type isolation, canonical model
grouping, historical money, zero/invalid/unsettled values, exact numeric precision,
benchmark separation, negative savings and missing references.

Production app `1e7eeb71e542cb952dc7b7917b2473ac0dc0c0c4`, release
`bg-20261116T050323-952d85ab`, completed. Candidate/public three-protocol terminal
events, login continuity, acknowledged usage and unique settlement passed.
Maintenance session revoked, reuse 401, token file removed.

Account 122 live verification: 1794 records, CNY 26.12919623, model totals reconcile
with the account total. Its comparison uses platform reference, not official
tariffs: 1048 comparable records, reference CNY 260.7450119944, actual CNY
21.043186036, saved CNY 239.7018259584 (91.93%). No current model price was applied
to historical usage. Public aggregation returned in about 10 seconds. This is a
reference-cost comparison, not a measured quality or productivity benefit.
Runtime browser-shell verification with real reads passed light/dark at 390/1440.
Evidence: `/tmp/acu-account-overview-live/report.json` and screenshots; acceptance
session revoked with 401 reuse. Native packaged Runtime status is recorded in
its own release acceptance document.
