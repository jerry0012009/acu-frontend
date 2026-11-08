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

## Visual refinement

The follow-up visual pass keeps the site's neutral theme, inherited typeface
and configurable primary accent. The connection switch becomes a fixed-height
underlined mode selector; Runtime identity, release, applications and download
controls share a consistent hierarchy. Download actions are monochrome for
clear emphasis, with a responsive control row and reserved feedback space.
Steps use numbered line icons and separators, not nested cards or invented
connection states. API credentials and all shared client tutorials now follow
light/dark theme tokens rather than a fixed dark-blue surface.

Playwright covers 1280px/390px in both light/dark themes, control alignment,
first-viewport product/action visibility, responsive step order, loaded product
icon, keyboard order, download text contrast >= 4.5, and stable step placement
after download feedback. Existing reveal/hide, dismissal, Linux/Mac choices,
empty Key and retry coverage is retained. Screenshots use theme-qualified names
under `/tmp/acu-runtime-onboarding-browser`.

Visual application revision: `ba37580c59d671ad07df1c005c635f5e1839e8e2`.
Independent release manifest:
`/var/lib/acu/releases/20261108T170648-c75e445b/manifest.json`.
Candidate image:
`sha256:6cd9d3141457843510e52bea04eca49bc982af954bec49368eea23f27176785a`.
Public browser checks confirm the new download controls, three steps, correct
release URL and theme-inherited API panel at 1280px/390px, light and dark.
Additional local English checks at 320px/768px/1920px have no horizontal overflow.
Screenshot files were generated, but direct image inspection was unavailable in
this agent session; verification uses browser geometry, computed styles, loaded
assets, contrast and interaction assertions, not a claim of human visual review.
Replacement took 7.312 seconds, health recovered at 19.247 seconds, business
smoke passed at 19.799 seconds. Sampled public requests succeeded; no continuous
traffic or paid streaming acceptance was performed.
Final visual release status: `completed`, no error or rollback, 81.132 seconds
total including observation. Console is healthy with `unless-stopped`.

## Product narrative and usage guide

Restore `Usage Guide` to `/` in both dynamic and fallback navigation while
retaining the explicit `/connect` download entry. First-login redirects remain
unchanged. The guide keeps ACUindex as the product, and Runtime as its optional
access assistant. Existing task-level orchestration positioning, value copy,
demo, pricing and workflow links remain accessible.

The desktop guide uses aligned product/access columns, with unframed routing,
cost/quality and assurance value rows on the left. Mobile places a brief product
introduction before access, and the complete description and value detail after
access. Theme tokens, inherited fonts, fixed type sizes and restrained dividers
replace the previous gradients, animation-dependent hidden content and pill
collections. Remaining homepage sections are unchanged.

`test/usage-guide.browser.mjs` checks product purpose, demo and onboarding links,
all three values, loaded image assets, desktop non-overlap/top alignment, mobile
reading order and first-viewport download, guide navigation, retained `/connect`,
and narrative persistence when changing API/Runtime modes. Viewports cover
320px, 390px, 768px, 1440px and 1920px with Chinese/English and light/dark themes.
Screenshots: `/tmp/acu-usage-guide-browser`. Direct image inspection is not
available in this session; browser geometry and interaction checks are the
visual-verification evidence. The focused Runtime browser suite and 19 related
unit/installer tests also pass. No backend, account, Key or billing changes.

Guide application revision: `c24c1f7b82c222ad01a46f31d93d81cc5d34bb74`.
Release manifest: `/var/lib/acu/releases/20261108T172809-f219bd81/manifest.json`.
Image: `sha256:e87225981fea6b9e06de10dbd4ce8c2ccf2c1940813f3f225337d74938bc19a1`.
Replacement 7.971 seconds, healthy at 20.119 seconds, smoke at 20.760 seconds.
A sampled public 502 and an initial browser timeout occurred during replacement;
after health recovery all four public desktop/mobile light/dark checks passed,
including product purpose, all three values, no horizontal overflow, and retained
narrative when switching to API mode. Both public status endpoints succeed.
Public screenshots: `/tmp/acu-usage-guide-browser/public-*.png`.
Final guide release: `completed`, no error or rollback, 80.707 seconds including
observation. Console is healthy with `unless-stopped`; Router remains unchanged.

## Storefront candidate, not deployed

The next local candidate restores a more expressive product/tool composition:
equal desktop columns, larger product-purpose typography, primary start action
and secondary demo, compact three-column value detail, and one framed connection
tool with a header, mode navigation, download controls and quieter installation
detail. Styling is scoped to `.acu-usage-guide`; `/connect` remains unchanged.

The guide browser suite adds tool-surface/radius and keyboard-order assertions;
all seven guide viewport/theme/language cases and the independent Runtime
browser suite pass. Typecheck, affected-file lint, 19 related tests and the
production frontend build pass. No production build, replacement or restart is
performed for this candidate. Human visual approval remains outstanding.

Current-online/candidate first-viewport screenshots and the side-by-side HTML
are in `/tmp/acu-guide-comparison-20261108/index.html`. This is a comparison to
the current public page, not a reconstructed original-release screenshot.
Direct image viewing is unavailable to this agent; layout assertions must not
be represented as aesthetic approval. Keep the local preview separate from
production and review the actual composition before another rollout.

## Editorial refinement candidate

The next pass follows the user's preference for the closing section's spacious
typography and removes repetitive icon tiles. Reference pages were fetched and
opened with Chromium: `https://linear.app/features` and `https://vercel.com/home`.
Their chapter hierarchy informed the composition; no assets or branding were
copied, and screenshots were not visually inspected by the agent.

- Pass 1: Replace the capability bento/icon grids with a lead routing chapter,
  three secondary editorial entries and four keyboard-accessible disclosure rows.
- Pass 2: Convert the process section to a vertical numbered sequence; remove
  first-viewport three/four-column icon repetition. Keep all existing value copy
  and the closing headline/actions. Remove decorative background blobs from CTA.
- Pass 3: Verify the complete page's responsive chapter order, disclosure
  click/Enter behavior, tool framing, no overflow, original narrative, links,
  loaded assets, and independent Runtime/API/Key interactions.

Typecheck, affected-file lint, production frontend build and 19 related tests
pass. Seven guide viewport/language/theme scenarios and the independent Runtime
browser suite pass. Full-page screenshots are in `/tmp/acu-usage-guide-browser`;
the online/candidate comparison remains in `/tmp/acu-guide-comparison-20261108`.
The existing managed preview at port 5178 serves this candidate.

The user explicitly requires visual acceptance before deployment. The image
viewer again returned `view_image is not allowed because you do not support
image inputs`; computed-layout assertions do not fulfill that requirement.
Accordingly this remains a preview-only commit. Production stays at `c24c1f7b8`;
no production build/replacement/restart was initiated for this pass.

## Compact access panel candidate

The guide-specific access panel now uses 40% of the desktop tracks, capped at
440px, with no shadow and reduced header/identity weight. At 1440px the product
column is approximately 701px wide; default Runtime access is 440x523px rather
than approximately 584x780px. Duplicate introduction headings and app names are
not shown in the guide panel; the explanatory copy and download remain.

`compact` is opt-in through HeroTerminalDemo only. Its three-step guide is a
native disclosure, collapsed initially and verified to expand. The independent
`/connect` experience and other embeddings retain the complete default flow.
All platform and API controls remain accessible. Seven responsive guide cases,
independent Runtime/Key browser checks, 19 related tests, typecheck and affected
lint pass. Screenshots and the existing port-5178 preview are updated. This
remains preview-only pending actual visual acceptance; production is unchanged.

## Unified guide and color refinement

The user removed the requirement for a separate connection/download page.
Navigation now has only Usage Guide; `/connect` is a compatibility redirect to
`/#start`, and first-login guidance uses that same anchor. The former page's
credential retrieval, balance notice, guide-dismissal setting and console link
are retained in `ConnectionGuide`, embedded in the right-hand tutorial tool.
No model credential is fetched until the user opens the API mode and explicitly
reveals it. Existing account settings and backend endpoints remain unchanged.

The guide keeps its compact 440px tool width, with collapsed setup instructions.
Color is used sparingly on the purpose underline, selected connection mode and
download command. Initial use of the site's primary color failed the 4.5 text
contrast check (2.72); separate light/dark action colors correct that regression.
Theme-based surfaces, the real product mark and workflow brand assets remain;
there are no repeated three/four-column decorative icon grids.

Validation: seven guide cases pass with no duplicate `/connect` navigation;
four signed-in browser cases verify the legacy redirect, compact disclosure,
download contrast/keyboard/feedback, Key reveal/hide, and preference saving.
Linux/Mac selection, failed Key-list retry and empty Keys also pass. Nineteen
related tests, typecheck, affected lint, frontend build and diff checks pass.
The managed preview is updated; no production release was attempted. Direct
screenshot viewing remains unavailable, so aesthetic approval is still pending.
