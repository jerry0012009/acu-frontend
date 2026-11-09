# Console product clarity and visual review

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
