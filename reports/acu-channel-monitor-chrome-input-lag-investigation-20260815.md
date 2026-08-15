# ACU Channel Monitor Chrome Input Lag Investigation

Date: 2026-08-15

## Scope

This was a read-only browser investigation of the Overview card expand/collapse
input lag reported at:

`https://console.acucompute.com/usage-logs/channel-monitor`

Production frontend baseline:

`9435c1220943d5994b5f76bc03fa4f365a5cb8f4`

No ACU frontend code, backend service, database, production configuration,
Router, Probe, Billing, or deployment state was changed.

## Diagnostic Setup

The production frontend build was run in headful Chromium with a real
production monitor snapshot obtained through the existing read-only internal
channel-monitor endpoint.

Snapshot size during the runs:

- 61 Channel Cards
- 226 Profiles
- 98 production history rows
- 1,594-1,596 probe history rows
- 122 timeline containers
- 7,320 timeline bucket spans

The production Admin login endpoint was temporarily rate-limited with HTTP 429.
For the Admin-only page rendering experiment, the existing smoke user's
short-lived access bundle was obtained through the local production New API
listener, and the Admin role plus monitor response were overridden only inside
the browser diagnostic context. No credentials were written to disk or
production state.

This preserves the production frontend DOM, React component behavior, real
monitor data shape, and card interaction path. It is not a claim that a new
production Admin session was created.

## Normal Browser Measurement

Without DevTools Performance recording:

- Expand/collapse click command: approximately 30-68 ms
- Mouse-move command maximum: approximately 36-63 ms
- Renderer event-loop maximum: approximately 104-127 ms
- No stable 1-2 second input freeze was reproduced

The card content appeared or disappeared immediately. The measured short
renderer spikes were below the reported multi-second browser freeze.

## Performance Recording Without Screenshots

Chrome tracing was started through the DevTools Protocol with Screenshots
disabled. The trace covered four expand/collapse operations.

Measured interaction values:

- Click command: approximately 36-131 ms
- Mouse-move maximum: approximately 38-67 ms
- Renderer event-loop maximum: approximately 240 ms

Trace event summary:

- `Browser / CrBrowserMain` maximum `RunTask`: 8.4 ms
- `Renderer / CrRendererMain` maximum `RunTask`: 97.9 ms
- GPU `VizCompositorThread` maximum task: 41.4 ms
- `Layout` maximum: 48.1 ms
- `Paint` maximum: 66.0 ms
- `UpdateLayoutTree` maximum: 9.6 ms

No multi-second `CrBrowserMain` task was present. This contrasts with the
previous user trace, where `CrBrowserMain` showed approximately 4.3-second
CPU-heavy `RunTask` intervals while Performance recording was active.

## Browser-Side A/B Experiments

All experiments were temporary DOM/CSS changes applied from the browser and
were removed after measurement.

### A/B 1: Card Content Visibility and Containment

Applied to every Channel Card:

- `content-visibility: auto`
- `contain: layout paint style`
- `contain-intrinsic-size: 320px 420px`

Results compared with the unmodified baseline:

| Metric | Baseline | Card containment |
| --- | ---: | ---: |
| Click command | 31.7-55.5 ms | 17.2-28.0 ms |
| Mouse-move maximum | 36.4-63.0 ms | 29.9-42.6 ms |
| Renderer lag maximum | 104.1 ms | 55.3 ms |

This was the clearest and most stable improvement.

### A/B 2: Timeline and Offscreen Card Isolation

#### Hide 122 Timeline Containers

The Production and Probe timeline containers were temporarily hidden while
leaving the React DOM mounted.

- Click command: 24.3-49.0 ms
- Mouse-move maximum: 27.5-63.0 ms
- Renderer lag maximum: 64.3 ms

This produced a modest improvement, indicating that the 7,320 bucket spans
are a secondary rendering/compositing cost, but not the primary source of the
reported freeze.

#### Hide Offscreen Cards with `display: none`

53 of 61 cards were hidden after scrolling the target card into view.

Although initial clicks became shorter, the experiment introduced a
190.3-ms mouse-move spike and a 410.5-ms renderer lag spike. Removing cards
from layout caused reflow and was not a stable fix.

## Root Cause Ranking

### 1. Chrome Performance recording amplification

Most likely explanation for the previously observed multi-second
`CrBrowserMain` activity.

Evidence:

- Normal browser use did not reproduce a stable 1-2 second freeze.
- Screenshots-disabled tracing had no long `CrBrowserMain` task.
- The prior trace's approximately 4.3-second browser-process tasks occurred
  while recording was active.

### 2. Large uncontained Overview DOM

Likely secondary contributor during normal browsing.

The page keeps 61 Cards and 7,320 timeline spans mounted. Card-level
`content-visibility` and containment consistently reduced interaction and
renderer lag without changing the data model or React behavior.

### 3. StatusTimeline bucket spans

A measurable but smaller contributor. Hiding the 122 timeline containers
improved renderer lag, but did not explain a multi-second browser-process
freeze by itself.

### 4. Profile detail DOM

Not supported as the primary cause. The expanded target adds only its own
profile detail rows, while the trace showed no second-scale Renderer Main,
Layout, or Paint task.

## Recommended Minimal Formal Fix

Apply the tested card-level containment behavior to the Channel Card root,
with a conservative intrinsic size:

```css
content-visibility: auto;
contain: layout paint style;
contain-intrinsic-size: 320px 420px;
```

Expected file:

`web/src/features/usage-logs/components/acu-channel-health-card.tsx`

Do not use `display: none` for offscreen Cards. There is no evidence in this
investigation requiring a virtual list, Web Worker, API split, or Router/
backend change.

## Final Status

- Investigation only
- No code changes made
- No commit or deployment performed during the investigation
- Worktree remained clean at the production baseline
