# Conversation Existing Key Recovery

The shared options endpoint waited for the text routing monitor before returning
existing API keys. Monitor failure produced a business-error envelope, which the
web client converted into an empty key list. Pending requests also displayed
"No available API key". Image/video depended on that same text monitor despite
having their own model endpoint. A stale local selection could show the empty
label even with populated key options.

The existing endpoint now supports key-only reads (`include_models=false`). All
three pages select the first usable owned key without waiting for the monitor.
Text loads models separately; model failure retains keys and exposes Retry.
Legacy full-options calls retain keys with `models_error` on monitor failure.
Business failures now throw instead of masquerading as an empty key list.
Pending selection displays Loading, and unknown selections fall back to the
first returned key. Query identity includes the signed-in user.

The shared authenticated playground middleware uses the same first usable owned
key if no key header was supplied. Explicit invalid/foreign/expired/disabled
keys are still rejected. Quota, group, model and profile restrictions remain
authoritative; no keys are created, credentials exposed or permissions expanded.

Regression first reproduced monitor HTTP503 returning success:false despite an
existing key. Controller/middleware/service focused and race tests pass. Browser
regression covers text/image/video, pending keys, stale URL selection, populated
keys with missing selection and independent media-model loading. Frontend
typecheck, changed-file lint and production build pass. Real production API
baseline for users 1/3 returned 3/7 keys and 71 text options; browser baseline
confirmed empty-key wording before the slow options response completed.

This is a frontend repository release (Go HTTP + browser + existing worker),
not a Router or Runtime binary release. Existing Runtime windows need reopening
to load updated web assets. Release uses the canonical blue/green unit.

## Production Acceptance

`bg-20261116T064825-eedfe78e` completed on frontend revision
`da5a508efb085a5916fb3a5555986b19ced1b9b2`, image
`sha256:fa43c5a64090e652ab1c085058ef77536f7aa71a712a0b4c6a0ed0201a1dddb8`.
Candidate/public standard three-protocol streaming and unique settlement passed.
Active HTTP and sole worker are healthy with unless-stopped; previous HTTP
exited 0 with restart disabled. No Router or Runtime binary replacement.

Public browser tested all three pages with an invalid prior token ID and the
real user3 key list: existing first key selected, no false unavailable message.
Using user1's existing first key 508, no new key and no selection header, public
text completed, GPT Image 2.6 produced an image and Seedance 2.0 Mini completed
task `task_X3NTe4hIcf6lKjxFpgzm0nCpOdkJ159V`. Media options returned 41 models.
The estimate was CNY 0.80480992; task submission and polling used the same key.
No account/token scopes or quota policies changed.

Evidence: `/root/jerry/exports/conversation-key-20261116/`, public screenshots
`/tmp/acu-default-key-public-{playground,image-playground,video-playground}.png`
and the release's standard acceptance/revocation files. Local dev server and
production acceptance sessions are closed after verification.
