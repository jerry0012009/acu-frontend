# Console product clarity and visual review

## Subsequent design correction

## Accepted Historical Baseline

The owner confirmed screenshots rendered from actual deployed Console
`7d7c6038b120e1d01c061c1da918930e5eb79cc0`, recorded as running on November 5
and released in `20261031T041204-e07df003`. The final implementation restores
that hero, feature composition, process section and closing visual, rather than
recreating the intermediate November 8 layouts. The only new hero experience
is a Runtime tab added before the five original client tutorials, inside the
original dark terminal surface. Current download, manual setup, key privacy,
onboarding and installer implementations remain. Historical hardcoded animated
supply counts are not reintroduced as live evidence. Closing copy continues to
describe using ACU, not deploying a private gateway.

`storefront` is scoped to the home connection guide. Other shared quick-start
surfaces retain their existing layout. Browser regression checks cover all six
tabs, desktop column constraints, both themes, mobile/tablet, download links,
disclosures, Linux fallback, key failures and explicit key reveal/hide.

The following notes describe superseded iterations.

The owner subsequently clarified that "original" means the pre-November-8 hero
(`20d0ddb33`), not the immediately preceding iteration. The follow-up restores
its large colored purpose headline, compact category badge, application marks,
and left/right composition. It removes the recently added standalone ACUindex
display heading and value table. The right side retains current Runtime/API
functionality and adds an explicit description of the optional desktop setup
assistant. Backend and authenticated overview remain unchanged.

The owner rejected the single-column guide and account screenshot. The follow-up
restores the previous left/right composition, original product-purpose copy and
colored headline. Only the right-side connection tutorial is refined, with a
smaller 408px tool, a brief install/sign-in/app sequence and expandable details.
The account preview and its bitmap assets are removed. Direct `/#start`, legacy
`/connect`, Runtime-first and manual API flows remain available without a new
outer disclosure. Authenticated overview changes are not reverted by this scoped
guide correction. The description below records the superseded first iteration.

## Scope

Only `console.acucompute.com` changes. The `acucompute.com` website and Router
application are unchanged. No schema, billing, authentication, automatic key
creation, installer catalog, or upstream behavior changes are included.

## Experience

- The usage-guide introduction states a concrete ACU value, followed by one
  connection action. Runtime and manual API setup remain in the same guide,
  disclosed on demand. Direct `/#start`, legacy `/connect`, first-sign-in,
  and repeated connection actions reveal the Runtime-first setup.
- Product positioning, demo, pricing, routing narrative, and closing invitation
  remain. Unsupported animated supply statistics are removed.
- Theme-specific product screenshots are captured from the actual overview
  using isolated sample account data. Captions explicitly distinguish the
  example from live data. No production user information is captured.
- The authenticated header no longer duplicates public navigation. The sidebar
  retains its existing permissions and configured groups.
- Overview prioritizes actionable account needs, account metrics, actual hourly
  usage, model diagnostics, then auxiliary resources. Completed setup has no
  persistent banner. Auxiliary resources remain accessible through disclosures.
- Performance aggregates retain the previous equal-model calculation and now
  explicitly identify it as unweighted, rather than implying request-weighted
  service availability. Available sample counts accompany models. No new
  availability alert threshold is introduced.
- Empty monitoring is compact. Only existing super-admin users see the settings
  link. Loading, failed fetch, unconfigured, and populated states are distinct.

## Verification

Commands use the existing Playwright installation through `PLAYWRIGHT_MODULE`.

```bash
cd web
bun run typecheck
bun run build
cd ..
GUIDE_BASE_URL=http://127.0.0.1:5180 node test/usage-guide.browser.mjs
ONBOARDING_BASE_URL=http://127.0.0.1:5180 node test/runtime-onboarding.browser.mjs
CLARITY_BASE_URL=http://127.0.0.1:5180 node web/src/features/dashboard/components/overview/__tests__/clarity.browser.mjs
```

Affected components were linted and formatted. Browser checks cover 320, 390,
768, 1440, and 1920 pixel widths, English/Chinese, light/dark, keyboard
disclosures, repeated `#start` actions, image loading, Runtime download and API
switching, explicit key reveal/hide, onboarding dismissal, role boundaries,
configured/empty monitoring, and data failures.

Actual screenshots were directly inspected over several iterations. Review
corrected a legacy grid placement at tablet widths, Chinese typography,
competing download emphasis, nested metric frames, and oversized empty states.
Final production-build screenshots are in `/tmp/acu-usage-guide-browser` and
`/tmp/acu-product-clarity-production` on the review host.

The GitHub latest stable Runtime release was rechecked as `v0.1.47`; the guide
continues to use the existing pinned official assets. Browser downloads are
fixtures, not native operating-system installer acceptance. No new paid model
or streaming/billing acceptance is claimed for this UI-only release.
