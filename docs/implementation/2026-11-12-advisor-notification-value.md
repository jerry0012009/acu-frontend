# Advisor Notification Value And Duplicate Toast Fix

The previous renderer replaced all legacy/unusable short summaries with three
missing-content sentences. The browser joined those sentences with arrows and
rendered them as an information toast. That produced repeated identical text
with no task value. This behavior is removed, not treated as a successful notice.

Validated structured summaries retain their actual title, issue, preference and
corrective reference. Historical records without summaries show a bounded,
redacted excerpt of the actual audit problem and existing advice. No preference
is inferred for them; the absent preference section is omitted. Original audit
result claims are labeled as audit text, not independently established fixes.
Full evidence remains available through the record link. No historical record
is rewritten and no notification/email is replayed.

The notification API exposes `contentKind=structured|audit` for review. Local
read-only rendering of the latest six user records verified the three stored
structured notices still render their exact titles (extension loading, local
browser verification, and trial-package key/data risk), while three older
records render their actual audit rather than empty-copy explanations.

The browser effect previously initialized its seen-ID set from the empty loading
result. The first actual result could therefore toast the recent historical
batch. It also replaced the seen set with only the latest page, allowing an ID
that reappeared later to notify again. The effect now waits for the first
successful user-scoped fetch, establishes the baseline silently, and keeps seen
IDs across polls. Account changes reset the baseline; notification/preferences
queries are keyed by user. New different risks remain visible, and read records
do not toast. Existing unread rows remain in the bell; none are silently marked
read or deleted.

Advisor toast IDs are stable per Advisor record and include a link action. Toasts
use the ordinary high-contrast surface at bottom-right rather than a long blue
top-center panel over the navigation. Mobile viewport containment is asserted
in the browser fixture. The older-placeholder client response path also uses
actual issue/advice rather than concatenating missing-copy sentences, protecting
mixed browser/server versions during release.

Verification: nine frontend notice/browser tests, typecheck, affected oxlint and
formatting, build, Go notification and SMTP regression tests; optional six real
record rendering via `ADVISOR_EXISTING_ROWS` (read-only captured local file).
`test/advisor-toast.browser.mjs` mocks API only on the local preview: initial
history is quiet, a new risk produces actual problem/advice/action, subsequent
polls do not recreate it. It sends no production notification or email.

Publish only acu-frontend with HTTP/worker in the same normal release manifest.
Router learning and global interval 20 are unchanged. Preserve the latest main's
authentication-captcha changes. No schema, environment, data backfill or SMTP
configuration change is required.
