# Runtime Preference Vector Starfish

Status: explicit owner requirement, 2026-11-12. The existing animated vector
starfish is a first-screen core experience of My preferences, not an optional
thumbnail or a replacement radar chart. Its authenticated data endpoint and
Console renderer are already deployed. This handoff requires no backend or
production application change.

## Product and visual baseline

Users should see their own preference directions, inspect an individual ray,
and understand its scope and saved interpretation. Call it **偏好向量 / Preference
vectors** in Runtime. This is an interpretable preference projection, not a raw
model embedding, personality test, calibrated understanding score, or proof
that future Agents will follow every preference.

Preserve the accepted Console composition: independent arrow-ended rays, subtle
concentric rings, a luminous center, restrained pulse/scan, domain names around
the perimeter, hover/focus emphasis and click-to-pin selection. Never connect
the rays into a filled radar polygon, turn the display into a decorative logo,
or replace it with a static screenshot. Do not add an invented global taxonomy.
Use real category labels and every returned ray, not a handpicked top-N set.

The graph occupies the main first-screen area of My preferences. On wide
windows, put the selected preference detail alongside it; on narrow windows,
place details below. Keep the plot square and its dimensions stable. Respect
Runtime's neutral/amber shell while keeping white rays on dark and dark rays
on light. Amber may indicate selection, not a different numerical metric.
Readable list/search and recent changes supplement the graph; they do not
replace it. Keep large collections accessible through list/domain selection.

## Reuse these exact sources

All paths are relative to `jerry0012009/acu-frontend` main. Adapt the UI/auth
dependencies to Runtime; do not load the authenticated Console in an iframe or
give its access token to the Magpie/kernel document. Prefer moving the renderer
into Runtime's own frontend with data supplied through its native Go boundary.
Do not copy or redistribute dependency/license material beyond permitted use.

- `web/src/features/private-acu/preference-starfish.tsx`: full SVG geometry,
  animations, arrowheads, domain labels, selection, zoom, responsive arrangement.
- `web/src/features/private-acu/preference-ray-lengths.ts`: ordinary radial scale.
- `web/src/features/private-acu/bipolar-ray-geometry.ts`: bipolar geometry.
- `web/src/features/private-acu/preference-profile-api.ts`: current wire types.
- `web/src/features/private-acu/preference-records.tsx`: selected source records.
- `web/src/features/private-acu/__tests__/preference-ray-lengths.test.ts` and
  `bipolar-ray-geometry.test.ts`: numerical invariants.
- `test/starfish.browser.mjs`: 100-ray fixture and arrow/interaction assertions.
  Its legacy theme setup must be adapted to Runtime's actual theme mechanism;
  always assert the effective theme, not just a localStorage preference.
- `test/preference-reader.fixture.mjs`: small ordinary profile and records.

Online visual baseline: `https://console.acucompute.com/private-acu/overview`
under the user's own signed-in account. Source is available on frontend main;
native Runtime pixel parity is still to be implemented and verified there.

## Endpoint and identity

`GET https://console.acucompute.com/api/user/self/acu-preference-profile`
using Runtime's existing dashboard session Bearer token. No user ID parameter,
model inference request, raw-vector export endpoint, or admin credential is needed.
The server supplies the current account, not necessarily the owner of a manually
entered inference Key. User login is required for the personal graph, not for
Key-only Runtime usage. Never create a fake graph for a logged-out/empty account.

```json
{
  "success": true,
  "data": {
    "status": "ready",
    "generatedAt": "2026-11-12T12:00:00Z",
    "error": null,
    "profile": {
      "summary": "Prefers verifiable, scoped work.",
      "sourceCount": 1,
      "excluded": [],
      "rays": [{
        "id": "opaque-preference-id",
        "label": "Scoped maintenance",
        "category": "Delivery",
        "score": 80,
        "confidence": 70,
        "summary": "Keep maintenance changes scoped and verifiable.",
        "scope": "Maintaining existing systems",
        "sourceIds": ["opaque-source-id"]
      }]
    }
  }
}
```

This is a synthetic wire example, not a sample to display as a real profile.
Profile `schemaVersion` and ray `bipolar` are optional. Do not confuse the two
new library/activity endpoints' `version:1` with the graph's optional schema.

## Two rendering modes

### Ordinary profile (no bipolar schema)

Group by `category`, sort categories as Console does, retain the within-domain
server ray order, and spread grouped rays around a full circle. With zero-based
index i and count n, angle is `i * 2*pi/n - pi/2`, center `(320,320)`.
Use `preferenceRayLengths` across the complete ray collection:

```text
minimum = min(scores); maximum = max(scores)
span = max(20, maximum - minimum)
midpoint = (minimum + maximum)/2
lower = max(0, min(100 - span, midpoint - span/2))
radius = 64 + (score - lower)/span * 186
```

Angle is a layout choice, NOT a semantic vector direction, similarity/distance
metric or comparable coordinate between accounts/refreshes. Length shows
within-profile relative strength, not an absolute axis starting at zero.
Do not add 0-100 ring labels, growth animations suggesting improvement, or
claim cross-snapshot length changes prove learning. Confidence is heuristic
evidence support (used for opacity), not probability/accuracy. A short ray is
not a defect or a worse preference. Empty input must not divide by zero.

### Bipolar profile (`profile.schemaVersion = acu-preference-v5-bipolar`)

Preserve all axes returned (the current complete schema contains 192). Do not
apply the ordinary projection's 100-ray generation limit to this schema.
Use each ray's `bipolar` object and the existing `bipolarRayGeometry` helper,
including its stable axis-ID jitter. `position` is 0-120 with midpoint 60:

- Length = `250 * abs((position - 60)/60)`; position below 60 reverses direction.
- `importance` is NOT the length; do not use the ordinary `ray.score` scale here.
- Midpoint 60 has zero length and no arrowhead, but remains selectable from the
  accompanying list. `applicability:false` also has zero plotted length and must
  not masquerade as neutral/weak learned preference. Retain it in accessible data.
- Show `name`, `end_a`, `end_b`, position, acceptable interval, importance,
  confidence and scope in selected details as appropriate, not around every ray.
- Preserve `origin`: `authorized_initialization`, `learned`, `user_explicit`.
  Explicitly distinguish initialized settings from learned/user-stated values.
- Preserve project/task/subtype scope and any `acceptanceConditions`; do not
  flatten conditional axes into a permanent global personality profile.

Unsupported/malformed schemas must not be silently interpreted using the other
mode. Return a readable unsupported state/list where possible, without inventing
directions or values. See wire types for the complete optional bipolar object.

## Interaction, records and refresh

Hover/focus previews a ray; click/Enter/Space pins it. Mouse leave restores
the pinned/default selection. Domain selection moves to a contained preference;
provide keyboard/list access even for zero-length or densely packed rays.
Arrowheads stay attached to endpoints during selection and animation. Support
zoom in/out without changing the encoded values or causing page overflow.
Honor reduced-motion preferences; animation never changes data geometry.

Selected detail includes label, summary, scope and the relevant mode's values.
Resolve all `sourceIds` through `/api/user/self/acu-preference-library` records.
Do not use ray ID as a substitute join key; merged rays can cite multiple source
IDs. Missing readable records do not erase a valid graph ray. No raw Markdown
fallback and no claim that saved interpretations are original user quotations.
`sourceCount` counts source documents, not independent observations or axes.

Keep `generatedAt` and status semantics: queued/generating may retain a previous
profile; render it while updating. Error with a saved profile keeps that profile;
empty or null without a previous profile must not fabricate vectors. Fetching
does not imply snapshot regeneration. Do not run a model or upload local history.
Use a 60-second cache plus explicit refresh; bounded foreground polling only
while queued/generating, stop once settled or hidden. Clear graph, pinned ray,
source details and pending requests on account change/logout/revocation; reject
late replies from the previous account.

## Runtime acceptance checklist

Verify ordinary 0/1/3/100 rays and a complete bipolar fixture including midpoint,
both opposing extremes, non-applicable axes, every origin, long domain labels
and multiple sources. Count rendered/data/list objects independently: an
ordinary ray has an endpoint arrow; a zero-length bipolar ray correctly does not.
Do not reuse a blanket "one arrow for every axis" assertion in bipolar tests.

Check hover/leave/pin/focus/Enter/Space, domain navigation, zoom in/out, source
selection, unknown schema, all profile states, account-switch late replies,
actual light/dark and reduced motion. Capture first-screen screenshots on narrow
and wide native Windows/macOS windows and verify line contrast, nonblank graph,
arrow alignment, no label/detail overlap and complete data access. Screenshot
fixtures do not replace a real signed-in account check. No native release until
these checks pass and the owner explicitly authorizes publication.
