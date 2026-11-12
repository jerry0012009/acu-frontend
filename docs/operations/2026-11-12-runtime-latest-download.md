# Runtime Latest Download

## Change

The public Runtime quick-start previously pinned its badge, installer filenames
and release-notes link to 0.1.47. It now uses public same-origin endpoints:

- `GET /api/acu-runtime/release`: latest stable version metadata.
- `GET /api/acu-runtime/download/windows`: Windows x64 installer redirect.
- `GET /api/acu-runtime/download/mac-arm`: Apple Silicon DMG redirect.
- `GET /api/acu-runtime/download/mac-intel`: Intel Mac DMG redirect.

The service reads the official GitHub `releases/latest` API, excludes drafts and
prereleases, and selects uploaded assets with exact official repository URLs.
Successful lookups are cached in each process for five minutes. Failed lookups
are cached for one minute without serving an expired version. Download responses
and metadata use `Cache-Control: no-store`. Missing assets or lookup failures
redirect downloads to the official latest-release page, never to a pinned old
installer. The page refreshes its version query every minute while active and
hides the badge when metadata is unavailable. Downloads resolve on click even
when the page has remained open across a release.

No schema, production environment, dependency or Router changes are required.
Future Runtime releases using the existing asset naming convention do not
require a frontend rebuild. Upstream publication can take up to five minutes
to be reflected in the resolver, plus the page's one-minute polling interval
for its version badge.

## Verification

- Regression test failed against the original 0.1.47 download URL before repair.
- Frontend ACU tests: 19 passed, including dynamic metadata and failure handling.
- `go test ./controller ./service ./router -run '^TestRuntimeRelease' -count=1`
  passed, including cache refresh, error backoff, unsafe URLs, incomplete assets,
  platform redirects and no-store headers.
- Frontend typecheck, changed-file lint/format checks and production build passed.
- At 2026-11-12 15:35 UTC, GitHub latest was v0.1.52. All three platform download
  URLs followed redirects to HTTP 200 and the expected installer filenames.

## Publication Status

The user authorized main integration, production publication and its bounded
real-model acceptance on 2026-11-12. Publication is pending. Publish only `acu-frontend` through the
canonical Router `release-unit.py` workflow after rereading its current runbooks.
After deployment, check public metadata, all three download Location headers,
cache headers and the rendered version badge, then observe the same release
manifest through full completion and revoke its acceptance session.
