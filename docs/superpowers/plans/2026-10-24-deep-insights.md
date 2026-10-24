# Deep paper insights implementation plan

Goal: replace generic whole-paper highlights with evidence-linked insights and paper-specific questions, preserving local Codex subscription access and passage chat.
Architecture: shared two-pass extraction/review prompts and schemas; strict source validation before storing evidence and before display; native and API parity. Focused passage chat stays a single call. No external novelty claims without loaded sources. Two passes use the same model, not independent review.

- [x] Add tests for fabricated evidence, cross-page evidence, generic questions, focused-chat compatibility, and two-stage orchestration/cache.
- [x] Add src/insights.mjs for dossier/insight schemas, prompts, source checks and eligibility gates; integrate native runner and API provider. Bump analysis cache version.
- [x] Preserve insight fields in core validation and exports. Add compact insight meaning/evidence/uncertainty and paper-specific buttons, with clickable evidence that navigates within PDF.
- [x] Verify unit, browser, and live local Codex analysis on all 90 Monitoring Monitorability pages. Review actual generated insights and qualifications; install updated companion and package extension.
- [x] Review code, document measured verification/limitations, push repository and verify clean status.
