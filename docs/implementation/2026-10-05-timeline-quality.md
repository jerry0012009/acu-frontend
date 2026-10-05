# Timeline Quality View

Task branch: `feat/timeline-quality`, based on `origin/main` at `886620c64`.
This change has not been deployed by this task. No production configuration,
billing logic, database schema, or Router deployment was changed.

## Display

- Quality is the default tab; the original difficulty/cost chart remains in
  the Difficulty tab.
- Quality uses execution requests only, with a fixed 0-100 score axis.
- The solid line is the actual execution model's estimated quality. Dashed
  lines compare the best estimated model within the execution-charge budget
  and the highest official-price model supported by that request's protocol.
- The lower plot compares model execution charges with same-model official
  equivalent charges. Judge and failed-retry costs are not included.
- Missing evidence remains a gap. A budget without an affordable calibrated
  model does not produce a fabricated reference.
- Session/protocol changes break quality lines. Single recorded reference
  points stay visible in long timelines.

## Data Contract

`qualityComparison` is an optional, user-safe addition to each execution item.
Scores use 0-100, unlike the Router candidate snapshots' 0-1 values.

Actual execution estimates come from the matching historical model/candidate
and reasoning preset. A selected canonical candidate with a client reasoning
effort retains its existing canonical estimate; no new effort benefit is
invented. Candidate estimates recorded at a different difficulty are ignored.
The frontend's synthetic explicit-model difficulty is never used for quality.

References use the existing configured protocol catalog, recorded curves when
available, and equivalent normalized token usage. These are predictions and
equivalent costs, not measured answer quality or actual counterfactual bills.
Official reference prices and CNY exchange rates are the current configured
values, not a newly collected historical vendor-price ledger.

Missing cache/context evidence, unknown pricing, pending settlement, or an
unavailable catalog can leave comparisons absent. Catalog lookup has a
three-second deadline and does not prevent recorded quality/cost evidence
from being returned. Internal supplier and retry costs remain private.

## Acceptance

Real log replay: 100 routed execution records, with 100 recorded quality points.
Browser acceptance uses 60 records belonging to one user, with a local-only
read-only preview session and no production login or mutations.

Viewports: 1440x1000 light, 390x844 light, and 1440x1000 dark. Checks cover
nonblank canvas pixels, horizontal containment, both tabs, keyboard activation,
reference/cost tooltips, and zoom/reset. The screenshots and machine-readable
report are kept in the private local artifact directory
`/tmp/acu-timeline-quality-20261005/` and are intentionally not committed.

Screenshots were generated from the complete application, with canvas/DOM
checks and OCR text inspection. They are not mockup images.

Reproduction on this host:

```bash
ACU_VISUAL_DATA_DIR=/tmp/acu-timeline-quality-20261005 \
  node web/scripts/capture-timeline-quality-data.mjs
ACU_VISUAL_DATA_DIR=/tmp/acu-timeline-quality-20261005 \
  go test ./service -run '^TestTimelineQualityVisualReplay$' -count=1 -v
ACU_VISUAL_DATA_DIR=/tmp/acu-timeline-quality-20261005 \
  node web/scripts/preview-timeline-quality.mjs
```

In a second shell, run the normal frontend development server with
`VITE_REACT_APP_SERVER_URL=http://127.0.0.1:4190` and port `4179`. Then run
`web/scripts/verify-timeline-quality.mjs` with the same artifact directory.
The preview scripts never forward mutations or credentials to production.
Raw log/monitor artifacts belong in the private artifact directory, not Git.
