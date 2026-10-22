# Native Protocol Pricing Follow-up

The route-quote UI introduced in `61a4e0b85` applied the page's Chat preview
to every model, including Messages-only Claude models. This affected both
the model drawer and the standalone detail route.

The fix chooses a supported native protocol for each model when the page
protocol is unsupported. The preferred protocol is retained whenever the
model supports it, even if it currently has no eligible route. This is not
a cheapest-protocol fallback.

The existing preview API and query cache are reused, with at most one shared
request per required protocol. API Key policy and token assumptions remain
identical across those requests. The quality chart retains its selected
protocol, while model summaries and details explicitly label their quote
protocol.

Internal catalog health tokens are removed from display descriptions/tags.
Comma-separated capability names retain spaces, so `Tool Call` and `ACU Auto`
are not split into separate tags. Empty performance responses are described
as no samples in the last 24 hours, independently of route availability.

Live reproduction: Claude Opus 5.5 returned no Chat quote but a Messages quote
with 12 eligible routes, CNY 1.225 input and 6.125 output per million tokens
at verification time. The performance endpoint returned an empty groups
array. These are snapshots, not fixed prices or an availability guarantee.

Validation:

- Pricing logic/component regression tests, TypeScript check, changed-file
  lint and production frontend build.
- Browser reproduction on the old production page at 1440x1000 and 390x844.
- Fixed local frontend against live read-only pricing APIs: drawer and direct
  detail route show Messages prices, route rows and no internal status label;
  no page errors or horizontal viewport overflow at either size.
- No inference calls, provider changes, billing changes or Router changes.

Browser evidence: `/tmp/acu-opus-pricing-20261022/`.
This native-protocol change alone needs only Console replacement. The later
multiplier and performance follow-up below requires both Router and Console.

## Multiplier and Performance Follow-up

Pricing summaries now lead with the selected route's estimated charge divided
by the official or public reference charge. Both sides use the same context
tier and preview input/output token quantities. Platform markup is included;
routing evaluation fees are excluded and remain explicitly described.
Input/output unit prices remain visible in the comparison table. Existing
route details and chart tooltips also expose the multiplier. No pricing range
controls or new billing behavior were added.

ACU bypasses legacy relay settlement, so the legacy performance table was empty
despite completed requests. The existing performance endpoints now aggregate
finalized ACU log evidence alongside legacy counters. Logical requests are
deduplicated; private ACU, pending, cancelled and invalid-timing records are
excluded. TPS uses successful output tokens over generation time. Summary
values are weighted by their underlying counters, not averages of group means.
Reads use the requested time window and a bounded 15-second cache. There is no
schema migration or billing-log rewrite.

The pricing overview and list now show the selected Top 1 profile's first
model-event latency, rather than average full-response duration. Router quotes
carry the source and sample count: genuine probe first-event P50/P90 weighted
75/25 is preferred when sufficient samples exist; otherwise production
first-event P50 is used. Full-response latency is never substituted. This does
not change route selection or utility scoring. TPS and success rate remain
model-level request statistics, with a 24-hour request count in the overview.

Read-only acceptance on October 22 used a sanitized 699-row log snapshot and
the actual modified Router quote path against production runtime evidence.
At that snapshot, Opus showed 0.036x, 2.09s first event from 19 probe samples,
90.11 tokens/s and 98.44% success across 64 eligible requests. These are
observations, not fixed prices or service guarantees. Desktop 1440x1000 and
mobile 390x844 browser checks passed without page errors or horizontal overflow.
Evidence: `/var/lib/acu/operations/pricing-performance-20261022/`.

Release Router first so its additive quote fields are available, then Console.
Both remain backward compatible during that transition; older Router quotes
display no first-token sample instead of falling back to total latency.
Prepare the independent rollout/rollback executor and obtain production
confirmation before replacement. This document does not assert deployment.

## Public Route Identity Revision

Pricing is a public surface, including when an administrator visits it. Both
global and API-key pricing previews now replace internal profile IDs with
stable anonymous IDs and expose only anonymous line labels and the existing
administrator-maintained public notes. Line numbers match the monitor's
existing four-digit numbering. Missing notes remain empty; provider, channel,
endpoint, internal names and non-public notes are not forwarded in route quotes.
The existing route table displays the note below the line label and safely
wraps long text. There is no new note editor or storage. Administrator monitor
and configuration endpoints retain their existing identities and permissions.

Controller regression tests exercise anonymous, regular-user and administrator
visits, checking response bodies as well as selected route and first-event
values. Tests also cover note changes/deletion, malformed routes, and a UI
fallback that never uses a supplier name if an anonymous code is missing.
