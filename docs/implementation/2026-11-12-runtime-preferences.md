# Runtime preference reading contract

Status: implemented in a task worktree, NOT deployed. No Router/Core changes,
schema migration, learning replay, new model calls or local Agent configuration
writes. Integrate/review and release Console separately before relying on the
new endpoints. A 404 on an older Console means unsupported, not empty preferences.

## Evidence and product decision

Bounded read-only inspection of account 3 on November 12 found 43 projected
preferences and inspected its latest 12 learning records. Two examples had
readable changed descriptions: rendered quality acceptance, and installable
software delivery. Many other updated documents kept the same description;
their long Markdown contains audit/evidence updates and is not suitable for a
compact end-user change feed. A broad aggregate inspection hit its short query
timeout; it was not retried as an unbounded scan. This is a sample assessment,
not an all-account quality certification.

Therefore ship saved preference interpretations and recent **summary changes**.
Do not claim original-human quotations, semantic novelty, complete history,
verified effectiveness, or that each run learned a new preference. Current
descriptions are source-authored/model-generated, not newly rewritten by Console.
Only complete single-line descriptions up to 400 Unicode code points qualify.
Common secrets, email addresses, URLs and home paths are redacted best effort;
this is not exhaustive PII detection. The view is private to a signed-in user,
never a public profile or an OS notification.

The browser fixture uses reviewed non-identifying source descriptions with
synthetic IDs, timestamps and account. It is not an authenticated production
screen capture. Normal tests make no paid model requests.

## Authentication

Use the existing Console dashboard access session with Bearer access token.
Both new endpoints require a live dashboard session in addition to UserAuth;
model API keys and dashboard PATs do not grant access. Identity is derived on
the server; no user ID query argument or admin credential is accepted.
Responses are no-store. Reuse Runtime's official native login/renewal bridge;
do not copy refresh cookies, passwords or tokens into the embedded kernel UI.
The account shown is the signed-in account, not necessarily the manually entered
model Key's owner. Login does not enable learning or automatic reference.

## New endpoints

`GET /api/user/self/acu-preference-library`

```json
{"success":true,"data":{"version":1,"records":[{"id":"opaque-source-id","summary":"Keep maintenance changes scoped and verifiable."}]}}
```

`id` joins profile `rays[].sourceIds` to saved records. Do not display IDs/slugs
as titles or infer evidence counts, original request dates, confidence or origin
from these records. Missing summaries stay missing. No Markdown, raw request,
internal prompts or file URLs are returned. Do not substitute this list's length
for the graph's total preferences/source count: unsuitable descriptions are absent.

`GET /api/user/self/acu-preference-activity`

```json
{"success":true,"data":{"version":1,"events":[{"runId":"opaque-run-id","trigger":"explicit_user_preference","recordedAt":"2026-11-12T12:00:00Z","changes":[{"preferenceId":"opaque-source-id","kind":"updated","before":"Brief reports.","after":"Conclusions first, then evidence."}]}],"inspectedRuns":1,"moreAvailable":false,"partial":false}}
```

Kinds: `created`, `updated`, `deleted`. Triggers: `user_dissatisfaction`,
`explicit_user_preference`. `recordedAt` is learning completion time, not the
original conversation time. Each event must be completed and owned by the same
account; team/film learning is excluded. An update requires two readable,
nonempty descriptions that differ **after** redaction. Changed descriptions
are textual differences, not proof of new knowledge. Events retain historical
summary text even when the current record later changes or disappears.

Work is bounded to the 100 most recent account-scoped runs and at most six
completed changed-run detail reads, under a 12-second context deadline. This
is a recent window, NOT a paginated complete history. `inspectedRuns` is a
diagnostic counter, never a learning-success metric. `moreAvailable` means a
known inspection cap was reached; false is not proof of complete history.
`partial` means at least one detail could not be read. Do not silently show it
as a complete empty result. No background polling on every request; on-demand
and explicit refresh with at least 60-second client cache is sufficient.

## Reused endpoints

- `GET /api/user/self/acu-preference-profile`: graph summary, domains/rays,
  scope, sourceIds, saved snapshot and generation status. Keep existing graph
  behavior; scores/confidence are heuristic, not accuracy or user personality.
- `GET /api/user/self/acu-advisor/settings`: separate learning/observer/advisor/
  injection flags and global effective controls. Read only in the initial Runtime
  view; opening the tab never changes any flags.
- The existing personal learning-run list now includes explicit preferences,
  excludes other-account/team/film entries, and guards detail ownership/kind.

## Presentation

Runtime adds My preferences without interrupting existing Key-only usage.
Logged-out: login action, no invented sample profile. Logged-in: graph/list,
readable saved records in a source drawer, and recent summary changes. Label
sources Saved preference records, not Original user evidence. Show an updated
summary with Previous summary collapsed; never load raw diffs as its fallback.
Search/filter must not discard undisplayed records from navigation.

Keep no-results, no-summary-changes, partial reads, errors and unsupported
endpoint distinct. Keep the last profile when generation fails; mark its saved
timestamp. An empty feed does not mean no learning happened. Do not show scores
as "understands you 90%", initialization as learned, or injection as adoption.

Account IDs scope client query/cache keys. On logout, account change or session
revocation cancel pending reads, clear sensitive caches and prevent late replies
from repopulating the view. Memory-only cache in Runtime for the first version.
Offline access must not preserve another account's last data.

## Acceptance

Local verification completed: 33 Private ACU frontend tests pass; focused Go
service/controller tests and router compilation pass; TypeScript check,
production web build, formatting and affected-file lint pass (one pre-existing
getElementById preference warning remains). Browser scenarios pass with actual
light/dark theme cookies. Desktop light and narrow dark screenshots were
visually inspected. The sample text is readable but formal, not polished
marketing copy. No authenticated live browser or native Runtime acceptance is
claimed. Screenshots: `/tmp/acu-preference-reader-20261112/`.

Service tests: scope/ownership, session-only access, explicit preference trigger,
redaction, identical descriptions, failed/incomplete runs, missing summaries,
partial failures and bounded detail inspection. Frontend tests: records/source
matching and missing records, comparison disclosure, escaping, empty/partial.
Browser: 320/390/1440px light/dark, full summaries, search, keyboard previous
summary toggle, graph source selection, partial/error state, no overflow.

Browser scope note: the existing global Console header overflows at 320px
(search/language/account controls). The new preference sections fit at 320px;
the whole page fits at 390px and desktop. This task does not redesign the global
header. Do not report whole-page 320px acceptance as passing.

Run `node test/preference-reader.preview.mjs` after `bun run build` in `web` for
the isolated loopback fixture preview at port 5189. It exposes no production
credentials and proxies no production traffic. Browser automation is
`test/preference-reader.browser.mjs`, with optional PLAYWRIGHT_MODULE and
CHROMIUM_PATH. Native Runtime sign-in, token renewal, account-switch races and
Windows/macOS rendering must be tested by the Runtime owner on real platforms.
