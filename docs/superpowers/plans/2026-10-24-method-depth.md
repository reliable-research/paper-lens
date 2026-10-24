# Method reconstruction implementation plan

Goal: provide source-grounded method explanations beyond critical caveats.
Architecture: extend the existing two-pass dossier/review pipeline with structured method reconstructions. Method highlights require procedure, rationale, formalism availability, assumptions, controls, a labeled example and reproduction requirements; non-method insights remain supported. Both backends use shared validation and prompts. Cache version changes.

- [x] Add red tests for rejecting shallow method highlights and preserving/revalidating structured reconstructions.
- [x] Extend shared schemas, prompts and validators; preserve metadata through browser, exports and cache. Display the method walkthrough in the passage popup.
- [x] Run unit/browser tests and a fresh all-page local Codex run on Monitoring Monitorability; inspect reconstructed evaluation archetypes and metric assumptions.
- [x] Update example/docs, companion and packages; review and push verified changes.
