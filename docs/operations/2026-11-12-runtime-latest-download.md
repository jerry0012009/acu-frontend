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

Published with user authorization on 2026-11-12. The download fix is commit
`19113f16b7580d6760fc20911b673222c36b1efe`. Concurrent reviewed Private ACU work
merged it into `5ee63ee5d9586df1743f90dc8b640b55925c1e1e`, the deployed frontend
revision. Related frontend tests (20), Go tests and typecheck passed again on
that merged revision. Local and remote main matched before publication.

The first build preserved the old image and produced the fix-only candidate.
After main advanced, the concurrent authorized release built the merged main
and published it through the canonical `release-unit.py` workflow. A duplicate
prepare attempt was rejected by the release lock without creating a second
manifest or launching another release.

- Manifest: `/var/lib/acu/releases/bg-20261112T160245-45385c54/manifest.json`.
- Image: `sha256:a2de8ac0b4a7aeed2d9a0f5329a3469fa7fde33143dd8a73c3ea2836ed33dc06`.
- Status: `completed`, no rollback, approximately 172 seconds including drain.
- HTTP slot B and the singleton worker run the same revision/image with
  `unless-stopped`; old slot A exited 0 with restart disabled.
- Candidate and public Chat Completions, Responses and Messages streams all
  reached terminal events, completed and received usage acknowledgement with
  exactly one finalization per request.
- Public `acu.best/api/acu-runtime/release` returned 0.1.52. Desktop 1440x1000
  and mobile 390x844 browser checks verified the badge, all three platform
  redirects, `no-store`, the latest-release help link, no 0.1.47 links and no
  JavaScript page errors. Screenshots are retained beside the manifest.
- Acceptance session logout succeeded; its token was rejected with HTTP 401
  and `auth.private.json` was removed. The first logout attempt lacked Origin
  and was correctly rejected with 403 before retrying with the trusted origin.

No errors were observed in the download/browser probes or model acceptance.
This is not an exhaustive assertion that every user stream was uninterrupted.
The subsequent documentation-only main commit does not require another build
or service restart; deployed application revision remains the one above.
