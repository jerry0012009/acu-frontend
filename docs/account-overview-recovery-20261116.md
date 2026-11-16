# Account Overview Recovery Acceptance

Application revision: `e3aafc738c52d506a5021ab1f2c2acc821891f40`.
Production manifest: `bg-20261116T105708-e3e9c1e3`, status `completed`.
Image: `sha256:90cf1626edc0001957b18a956410694598f9b682900902dba6509c51bebd4a72`.

A new minority platform-reference source previously invalidated the dominant
cohort and removed the entire comparison. Selection now prefers official data
when available, otherwise the largest single-source cohort with deterministic
ties. Different reference sources are never summed together. Platform reference
data remains labeled platform, not official.

The initial PostgreSQL projection optimization fixed 7-day loading but still
timed out at 30 days. The final implementation streams database rows and uses
the existing GJSON library to validate metadata and extract only billing fields,
preserving raw decimal scalars and rejecting malformed/nonobject envelopes.
No database-side JSON parsing or full diagnostic-object allocation is needed.
The existing cache/singleflight libraries provide a
30-second account-and-range-scoped cache and coalescing; balance reads remain
independent and uncached by this service. No schema, price or charging changes.

Real account-122 measurements through public ingress:

| Read | Before | After |
| --- | ---: | ---: |
| Full updated Runtime handler, 7 days | overview alone 12,494 ms | 981 / 183 ms cold/warm |
| Full updated Runtime handler, 30 days | overview exceeded 20 s | 3,394 / 190 ms cold/warm |

The restored cohort had 1,050 comparable records within 1,772 consumption
records. Source isolation and paired reference/actual-charge arithmetic were
verified. Targeted model/controller/service regression tests pass, including
account/range cache isolation and minority-source regression coverage. Race and
vet checks passed. Read-only production database tests cover 1/7/30 days:
35/1,772/8,650 records respectively; 49/1,430/5,202 ms under concurrent build
load. Final public Runtime response timing above includes network and all
four concurrent cloud calls; neither set is an owner-PC latency guarantee.

Candidate/public release checks each passed three real streams with unique
finalized usage. HTTP and singleton worker run the candidate image, healthy,
with `unless-stopped`. The release completed normal old-slot retirement.
All acceptance/measurement sessions were revoked; reuse returned HTTP 401 and
private token files were removed. Evidence is private under
`/tmp/acu-billing-recovery/`. Native Runtime packaging is tracked by its own
v0.1.103 release; browser-shell screenshots are not native owner-PC acceptance.
