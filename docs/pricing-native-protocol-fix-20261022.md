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
Production replacement remains a separately confirmed Console-only rollout.
