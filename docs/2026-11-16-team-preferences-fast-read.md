# Runtime Team Vector Read Recovery

Account `wzr0012026` (122) remains an enabled GYZ member. Saved team graph
is ready with 111 directions; no access or memory data was removed.

Authenticated production reproduction returned HTTP 200 after 24954 ms.
Runtime v0.1.98 proxies preference reads with a 20-second cloud timeout; its
browser UI treats non-401 team failures as an empty team list and caches that
state. This explains the missing tab despite valid membership and graph data.

The team endpoint previously loaded the complete film management view before
reading the saved graph, including all skill attachments and prompt cards.
It now checks membership and directly reads the configured team's saved profile.
The Router still validates the requested team space. Evidence remains in the
profile, and record previews are derived from its saved summaries, deduplicated
by source. No full-management fetch, new cache or permission bypass was added.
Management and source-library endpoints remain unchanged.

Focused service/controller tests and team-read race tests passed. Production
frontend application `2efa2bb0d41a26202a477c666cbd8b5b3bc575a8`, release
`bg-20261116T033821-33507c4a`, completed; candidate/public three-protocol terminal
events, login continuity and unique acknowledged settlement passed. Release
maintenance session revoked, reuse 401, token file removed.

Post-release account-122 authenticated reads completed in 525/90/79 ms.
Exact v0.1.98 browser assets with real account-122 cloud reads and the same
20-second timeout displayed the GYZ tab and all 111 arrows at 390/1440 widths.
This is browser-shell verification, not native control of the owner's PC.
Screenshots visually inspected. Its temporary session was revoked, reuse 401.
Private evidence: `/tmp/acu-gyz-0198-check/report.json` and two screenshots.

Existing v0.1.98 sessions that cached the empty list need a preference refresh
or a complete Runtime reopen. No new Runtime install is required for this
server-side recovery. The client's transient-failure-as-empty handling remains
a separate reliability limitation, not a claim that this release changed it.
