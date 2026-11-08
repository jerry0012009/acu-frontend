# Runtime-first ACU onboarding

## Scope

- `/connect` is a public, Runtime-first connection and download guide. Existing
  tutorial embeds default to Runtime too; explicit client links still work.
- Windows x64 and both Mac architectures use pinned official Runtime 0.1.45
  release assets. Linux, mobile and Windows ARM receive a direct API/terminal
  alternative. Mac CPU selection remains explicit because browser CPU detection
  is unreliable. Downloads never imply successful installation.
- The page preserves direct API/SDK, terminal installers and manual application
  configuration. The full Key is fetched only on explicit reveal; hidden Keys
  are masked in generated examples. Copying Keys no longer opens a tutorial.
- New ordinary accounts receive `acu_onboarding_pending` in the existing JSON
  settings. Password and OAuth login honor it unless there is an explicit
  destination or the native Runtime login bridge is present. Existing users are
  not backfilled or redirected. Users can dismiss future guidance through their
  account settings. Runtime login does not require a new browser-launch protocol.
- A default model API Key is inserted in the account-creation transaction for
  ordinary users, including OAuth. `GENERATE_DEFAULT_TOKEN` defaults to true;
  explicit false remains an operator opt-out. No startup/login backfill exists,
  and deleted/revoked Keys are never silently recreated. Key failure rolls back
  account creation. It uses the existing account balance without granting funds.
- No schema migration, Router change, model routing/billing change, or Runtime
  binary change is included. The deployed Console 96c8cd0c9 is retained in ancestry.

## Verification

- Model package tests pass. Focused registration, transaction rollback, default
  Key opt-out, login response and onboarding-setting controller tests pass.
- The full controller suite has two existing order-dependent candidate-pool
  failures (`TestTokenCandidatePolicyPersistsThroughUpdateAndRead` and
  `TestUpdateTokenPersistsFractionalCandidatePreferenceScore`); reproduced on
  unchanged canonical main. Both pass individually. They are not hidden or fixed
  as part of this change.
- Frontend unit/installer tests: 19 passed. Type checking, affected-file lint
  and production frontend build pass.
- Playwright covers desktop/mobile, Linux fallback, Mac download selection,
  masked-by-default credentials, explicit Key retrieval, hiding, dismissal,
  failed list retrieval/retry and empty Key list. Screenshots are retained in
  `/tmp/acu-runtime-onboarding-browser`. No paid model request is sent.
- Official release URLs return HTTP 200 after GitHub redirects. Runtime's
  upstream docs still lack real console.acucompute.com native-login acceptance;
  manual Key connection and the correct API address are documented as fallback.
  Windows/macOS native execution is outside this Linux host's acceptance scope.

## Release

Use the shared independent Console release executor with a preserved rollback
image. Keep Router running. Record the final manifest, image and revision after
the executor completes. Do not equate health checks with complete user streams.

Candidate application revision: `a23b0c9dfc1dc249303fa0f91be7959eecd389e4`.
Console image:
`sha256:1ca80f3e153489e2cd229741e1784490ece8372553ae002fe57b9824abee6991`.
Independent manifest:
`/var/lib/acu/releases/20261108T145249-462821de/manifest.json`.
Replacement took 19.742 seconds, healthy at 31.574 seconds, business smoke at
32.023 seconds. A public HTTP 502 was observed during replacement; no continuous
traffic measurement or paid streaming acceptance was performed.
Final executor status: `completed`, no error or rollback, 93.069 seconds total
including the stability observation. Console is healthy with `unless-stopped`.
All 20 existing public installer asset comparisons pass across both mirrors.

Public Playwright checks at 1280px and 390px verified `/connect`, the pinned
Runtime Windows download, direct API entry and no horizontal overflow. Public
screenshots are in `/tmp/acu-runtime-onboarding-browser/public-*.png`.
Both API and Console status endpoints report success. Production had no explicit
`GENERATE_DEFAULT_TOKEN` override. Registration/login acceptance used isolated
test databases rather than creating test accounts in production. Native desktop
Runtime sign-in remains outside the acceptance scope.

The implementation branch is `feat/runtime-first-onboarding-20261108`, pushed
to the canonical Console remote. Main is not modified. Router application stays
at `3bab08f`; its service is not rebuilt or restarted.
