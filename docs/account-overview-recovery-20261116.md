# Account Overview Recovery Acceptance

Application revision: `32aa5243bce4cef728c995f24d83e7527ee44faf`.
Production manifest: `bg-20261116T103437-d1da8e7d`, completed 2026-11-16.
Image: `sha256:97db8b06e4bff0ee6ed00c9031a7075cfe5eb9fb29937fa4647cbb19407c13c0`.

A new minority platform-reference source previously invalidated the dominant
cohort and removed the entire comparison. Selection now prefers official data
when available, otherwise the largest single-source cohort with deterministic
ties. Different reference sources are never summed together. Platform reference
data remains labeled platform, not official.

PostgreSQL 16+ metadata projection extracts billing facts in one envelope parse
and one billing-object parse, preserving decimal JSON scalars. Older database
paths remain unchanged. The existing cache/singleflight libraries provide a
30-second account-and-range-scoped cache and coalescing; balance reads remain
independent and uncached by this service. No schema, price or charging changes.

Real account-122 measurements through public ingress:

| Read | Before | After |
| --- | ---: | ---: |
| Cold overview | 12,494 ms | 4,726 ms |
| Immediate warm overview | not measured | 117 ms |
| Full updated Runtime handler | not measured | 3,584 / 199 ms cold/warm |

The restored cohort had 1,050 comparable records within 1,772 consumption
records. Source isolation and paired reference/actual-charge arithmetic were
verified. Targeted model/controller/service regression tests pass, including
account/range cache isolation and minority-source regression coverage.

Candidate/public release checks each passed three real streams with unique
finalized usage. HTTP and singleton worker run the candidate image, healthy,
with `unless-stopped`. The release completed normal old-slot retirement.
All acceptance/measurement sessions were revoked; reuse returned HTTP 401 and
private token files were removed. Evidence is private under
`/tmp/acu-billing-recovery/`. Native Runtime packaging is tracked by its own
v0.1.103 release; browser-shell screenshots are not native owner-PC acceptance.
