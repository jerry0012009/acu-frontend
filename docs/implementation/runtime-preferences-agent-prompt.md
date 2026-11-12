# Prompt for the ACU Runtime development agent

Implement a first-version **My preferences / 我的偏好** view in ACU Runtime.
First read the paired Console contract `2026-11-12-runtime-preferences.md` on
Console main. The server changes are deployed as application `b3a309d58`, release
`bg-20261112T134244-2463e229`, completed on 2026-11-12. Both version-1 endpoints
are available at `https://console.acucompute.com`. Use fixtures for development
and the existing authenticated session for live acceptance. Treat 404 on an old
server as unsupported, not empty preferences. Do not deploy Console or Router
as part of this desktop task.

Keep existing Runtime workbench, Agent setup, Key-only usage, usage, request
records, settings and native authentication intact. Add a focused navigation
entry; no landing page, giant marketing heading or new learning pipeline.

Owner clarification: the beautiful animated **vector starfish is mandatory and
the core first-screen experience**, not a secondary thumbnail. Also read
`runtime-preference-starfish-handoff.md` on frontend main. Adapt the existing
Console SVG renderer, radial-scale/bipolar helpers and interactions; do not
replace it with a static picture or filled radar chart. The graph API is already
online. It is an interpretable preference projection, not a raw model embedding.

1. Use the existing official native Console login/access-token renewal bridge.
   No login required to keep using Runtime with a model Key; account login is
   required only for personal preferences. Native Go owns token/API calls;
   never pass access/refresh/admin credentials to the kernel, URLs or logs.
   Show the signed-in account identity separately from any manually entered Key.
   Login/viewing must not enable learning/observer/advisor/injection.
2. Read existing `/api/user/self/acu-preference-profile` for graph, summary,
   domains, scope and `sourceIds`. Read new `/api/user/self/acu-preference-library`
   for `{version:1,records:[{id,summary}]}`. Join source IDs internally and show
   complete source descriptions as **偏好记录**. They are saved interpretations,
   NOT original human quotations. No raw Markdown/diff/request fallback, opaque
   IDs as titles, or inferred original-source timestamps.
3. Read `/api/user/self/acu-preference-activity` for version-1 recent summary
   change events. Show after text; updates offer a collapsed previous summary.
   `recordedAt` is learning completion time. Distinguish explicit preference
   and feedback learning. This is a bounded recent window, not complete history;
   preserve partial/moreAvailable states without turning them into success metrics.
   No feed content means no displayable summary differences, not "learned nothing".
4. Reuse Runtime black/white/amber system light/dark styling. Put the interactive
   vector starfish prominently on the first screen, with selected-ray detail
   alongside/below and a readable searchable list supplementing it. Preserve
   ordinary and bipolar geometry, hover/focus/click pinning, domain selection,
   arrowheads, zoom and reduced motion as specified in the starfish handoff.
   Source drawer/list must work
   by mouse and keyboard and retain full text at narrow desktop widths. Never
   call heuristic strength/confidence accuracy, depict initialized axes as
   learned preferences, or claim adoption/correction/savings from injection.
5. Read only initially. No local Agent-file writes, automatic prompt injection,
   historical conversation upload/replay, extra model calls, OS learning alerts,
   fake growth counters, preference editing/deletion buttons without server support.
6. On-demand reads with 60-second cache; no polling per inference. Cancel pending
   requests and clear memory-only private caches on logout/account switch/revocation.
   Block late responses from the prior account. Temporary renewal/network failures
   retain the existing session behavior; do not overwrite the selected model Key.
7. Test logged-out, empty records, unavailable source, unchanged summary, genuine
   changes, partial/error/404, stale saved profile, long Chinese/English text,
   account-switch late responses, logout and expired/revoked sessions. Test search,
   keyboard comparisons and no overflow at 320/390/768/1440px in both themes.
   Verify native login/renewal and complete user workflows on Windows/macOS.

Return the changed files, server contract compatibility, test results, actual
screenshots and preview/build instructions. Separate fixture browser checks from
authenticated native production acceptance. No release/publication without
explicit authorization.
