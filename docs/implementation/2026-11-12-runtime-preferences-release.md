# Runtime Preferences Console Release

The owner authorized main integration and production publication. The task
branch merged current main, including the latest Advisor fixes; pushed and
fast-forwarded canonical main to application revision
`b3a309d584f92a761a3031d3adcd28f0a7603cb8`.

## Release

- Public unit: `acu-frontend`; no Router/Private application release, environment
  modification or schema migration.
- Candidate image: `sha256:c58e74a72a76014a1c828ba76ab036ace284bb02f3f27a22a47381a6cc5c6325`.
- Previous image retained before build as
  `acu-rollback/new-api:predeploy-20261112T133756Z`.
- Independent release-unit manifest:
  `/var/lib/acu/releases/bg-20261112T134244-2463e229/manifest.json`.
- Final status `completed`, no error or rollback. Approximately 39.8 seconds
  from activation start to switch, 143.3 seconds to completion including
  acceptance, stability observation and automatic retirement.
- Console HTTP moved B to A. A and singleton worker run the same candidate
  revision, healthy with `unless-stopped`. Old B drained, received SIGTERM,
  exited 0 and has restart policy `no`.

## Verification

Merged-source checks passed: 37 related frontend tests, focused Go service and
controller tests, router compilation, TypeScript check and production web build.
Preference fixture browser regression passed desktop/narrow light/dark, search,
keyboard comparisons, sources, partial and failure states. Existing global
Console header overflow at 320px remains documented; new preference sections fit.

Candidate and public acceptance each completed Chat/Responses/Messages streams
with terminal events, Router completed state, acknowledged usage and one unique
finalized settlement per logical request. Both new endpoints returned version 1,
no-store and authenticated data; anonymous access was rejected. The configured
release account had 14 records and no summary-change events.

A separate bounded normal-role account session read 44 preference records and
two recent summary-change events. Browser verification uses the real session,
production assets, API responses and ordinary role at 1440/light and 390/dark.
Its refresh bootstrap is intercepted to supply the bounded access bundle; this
does not assert interactive sign-in, refresh-cookie handling or native Runtime
acceptance. Private screenshots/evidence are retained under the release's
`preference-browser/`, not committed.

All dedicated acceptance sessions are revoked through normal logout and rejected
with HTTP 401 afterward; private access-token files are removed. The first
cleanup attempt lacked Origin and received 403; adding the configured official
Origin succeeded without weakening the guard. No security policy was changed.

No 5xx lines were found in the release proxy logs for the inspected cutover
window, and sampled public status requests succeeded. This is not continuous
end-to-end zero-error measurement and does not guarantee all users' streams.

## Handoff

The runtime reading contract and agent prompt now point to available endpoints
on Console main. Documentation closeout may advance main beyond the deployed
application SHA; no restart is needed for those documentation-only changes.
Runtime native implementation and Windows/macOS acceptance remain with its owner.
