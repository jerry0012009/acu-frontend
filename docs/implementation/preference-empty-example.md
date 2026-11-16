# Empty Personal Preference Example

Private ACU renders an explicitly labeled, read-only example when the personal
profile endpoint reports `empty` without rays. It reuses the existing chart with
50 directions in five domains. Example details omit source records and numerical
evidence estimates. Data is local to the presentation layer, not persisted or
sent for personalization. The account's learning settings are unchanged.

No example is substituted for pending/error responses, existing personal rays,
or team creative vectors. Actual preferences replace it on the next successful
profile refresh. English and Chinese labels follow the active language.

Checks: preference-example and team-preferences unit tests, frontend typecheck,
scoped lint, production build, and `test/starfish.browser.mjs` for responsive
selection, empty-state labeling, and replacement by real preferences.
