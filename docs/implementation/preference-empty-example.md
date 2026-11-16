# Empty Personal Preference Example

Private ACU renders an explicitly labeled, read-only example when the personal
profile endpoint reports `empty` without rays. It reuses the existing chart with
150 directions in five domains. Example details omit source records and numerical
evidence estimates. Data is local to the presentation layer, not persisted or
sent for personalization. The account's learning settings are unchanged.

No example is substituted for pending/error responses, existing personal rays,
or team creative vectors. Actual preferences replace it on the next successful
profile refresh. English and Chinese labels follow the active language.

Checks: preference-example and team-preferences unit tests, frontend typecheck,
scoped lint, production build, and `test/starfish.browser.mjs` for responsive
selection, empty-state labeling, and replacement by real preferences.

## Production Acceptance

- Deployed revision: `12d0a1ccacdc6b54c68c4d14262ca7309021f9fa`.
- Manifest: `/var/lib/acu/releases/bg-20261116T134312-747f6153/manifest.json`.
- Blue/green status `completed`, no release error; executor exit 0. The previous
  HTTP slot exited 0 with restart disabled. Current HTTP and singleton worker
  are healthy with `unless-stopped` and the deployed revision above.
- Candidate and public Chat Completions, Responses and Messages streams all
  reached terminal events; each request completed with usage acknowledged and
  unique settlement verified by the bundled acceptance.
- Maintenance logout returned 200; credential reuse returned 401. The private
  acceptance token file was removed. An initial logout without Origin was
  correctly rejected with 403 before the authorized-origin retry succeeded.
- Browser regression passed against actual public assets at
  `https://console.acucompute.com` with isolated synthetic API fixtures. It
  covers the 150-direction example, labeling, keyboard interaction, mobile and
  desktop themes, and replacement by real preferences; no live user preferences
  were changed. An earlier supplemental browser login fixture timed out; the
  complete public-assets regression subsequently passed.
- Documentation after this revision does not require another application release.
