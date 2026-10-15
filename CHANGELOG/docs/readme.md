# README history

## 2026-10-15 — Give source consumers a reproducible entry path

The README now gives the clean source sequence `npm ci` → `npm test` followed by
local help and mock dry-run commands. It explains that tests compile current source
and that importing the API does not dispatch the host's arguments. The dry-run
report is explicitly mock data, not a live benchmark or evidence of model quality.

Verification: the documented local commands were observed in the before/after
repair evidence with no provider calls; relative history links resolve to this
change's existing surface lanes. No registry publication, model catalog, pricing,
or live model-quality claim was verified or changed here.

Commit: resolve through Git history for this path.

## 2026-10-15 — Explain hosted offline verification

The README now identifies the Ubuntu/Windows and Node 22/24 matrix, its dependency install/test/CLI/audit gates, and the boundary between offline mock output and provider quality. Existing source-onboarding guidance is preserved. Workflow authoring and local proof do not certify a hosted run; exact-head GitHub results remain required. See [the CI history](../ci/verify.md).
