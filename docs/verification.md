# Verification — 24 October 2026

- `npm test`: 11 tests passed, zero failed. Includes extraction from the actual 90-page source PDF, 203,873 characters, and exact anchoring for all 16 included guide passages.
- `EXTENSION_DIR=dist/paper-lens node tests/browser.mjs`: passed against the actual packaged Manifest V3 extension in isolated Playwright Chromium, not an HTTP facsimile. Checked highlight geometry on all 10 guide pages, source navigation, note persistence after reload, category/search filters, JSON download, local ranking, zoom, manual text selection, a different local PDF, OCR-required state for a PDF with no text, and returning to the source PDF by fingerprint.
- AI browser transport fixture: all 90 pages present in the outgoing request; an invented quote rejected; returned markup displayed as literal text; original notes retained after reanalysis and invalid response; zoom/secondary AI action disabled during pending analysis.
- Live external model: not exercised, because no provider/API key was supplied. The included guide is source-checked, pre-authored content. General local ranking is an explicit heuristic, not semantic model analysis.
- Visual QA: reviewed `test-results/reader-overview.png` and `test-results/rl-explanation.png`. PDF text and highlight rectangles align; the RL headline and its qualification appear together, with the explanation and notes in the margin.
- Source review identified async document switching, zoom/AI control locking, annotation merge IDs, stale selections and appendix exclusion; fixes were implemented and corresponding regression checks added.
- `npm audit --omit=dev`: zero vulnerabilities at install time. No store publication or installation into the user's existing Chrome profile was performed.

See `test-results/browser-report.json` for the machine-readable browser test report. Source PDF is unchanged; annotations are stored separately. Exported Markdown/JSON do not modify PDF bytes.

Public repository adaptation: demo downloads from arXiv on demand; browser tests intercept that URL with the hash-checked local fixture to remain deterministic. Real-PDF tests require `npm run fetch:paper`; the source is git-ignored.

# Local Codex 0.2 — 24 October 2026

- Actual subscription run: invoked the installed framed native host with all 90 pages (203,873 extracted characters) using the existing CLI ChatGPT login. It was a cache miss, not the included pre-authored guide or a mock response. Result: **28 source-verified highlights**, zero rejected quotes, covering 22 pages including appendices; all five categories were represented. Reported usage: 57,118 input tokens and 3,894 output tokens. No API key was used.
- Real native-browser test: isolated Chrome for Testing profile, installed host manifest with exact development extension ID, real Check Connection, then cached live analysis through Chrome Native Messaging. Verified all 28 explanations, filtered export completeness, source SHA-256, finite PDF-point rectangles for every highlight, and coordinate invariance across zoom (within 1 PDF point). No browser errors.
- Unit/integration tests: 18 passing, including real-paper extraction, malformed frames and size limits, cache identity, API-key auth refusal, sanitized child environment, native client cancellation/disconnect, note merges and quote rejection. Cancellation test uses a SIGTERM-resistant fake CLI and confirms SIGKILL escalation terminates it before request cleanup.
- API/viewer regression suite still passes; API is now explicitly selected in that suite. Default user interface selects Local Codex and does not show API-key fields.
- Native host registration and live-result cache remain local. No authentication token, full paper PDF, or personal configuration is committed. The actual Codex result and screenshots are in git-ignored test-results. The public extension and companion are separate packages; no Chrome Web Store submission has been made.

## Focused reader 0.3 — 24 October 2026

- Removed the permanent right column; explanations and notes open in a dismissible popup beside the passage.
- Header hidden by default, collapsible Reading map, source-position category tags, zoom auto-collapse, narrow-window drawer, and Fit control verified in an isolated Chromium extension profile.
- All 18 unit/integration tests, focused-layout browser test, existing 90-page browser regression, and real native-messaging test passed. The native test used the previously generated live Codex result from cache: 28 highlights.
- Visually inspected `test-results/focus-reader.png` and `test-results/focus-explanation.png` for PDF/tag alignment and popup layout.

## Explanation interactions 0.3.1

- Browser checks cover hover and click, moving into the popup, automatic dismissal after leaving, and absence of duplicated source headings and quotes.

## Passage conversations 0.4

- Quick prompts, free-text questions, follow-up context, all-page context, escaped answer text, and conversation reload are covered by browser tests using a controlled provider response.
- Conversation retention during reanalysis is covered by a unit test. The native Codex path reuses the existing selected-passage analysis protocol; the companion accepts explicit question/history fields and its prompt directs Codex to answer the question.

- Live uncached ChatGPT-subscription test sent all 90 pages with an explicit faithfulness/monitorability question. Codex returned one verified selected quote and directly answered that full faithfulness is unnecessary, with scope qualifications. Native auth was `chatgpt`; no API key. Local companion updated in place.
- 20 unit/integration checks passed; layout and browser regression cover the two-section popup, follow-up answers and persistence.

## Deep insights 0.5 — 24 October 2026

- Fresh, uncached local Codex subscription run: all 90 pages / 203,873 extracted characters, two sequential full-paper model calls (argument reconstruction, then challenge/ranking). Result: 7 model-ranked insights, 28 exact source evidence links, 21 specific questions. Each insight has supporting and qualifying/challenging evidence across multiple pages. One dossier entry failed validation before the second pass; zero final source rejections. Aggregate reported usage: 118,255 input and 9,531 output tokens.
- Inspected generated explanations for direct vs ordinary RL pressure, targeted hacking versus stable averages, obfuscation versus information relocation, trace-length confounds, simple false-completion misses, and metric validity. Saved the generated interpretation/evidence/question example in `docs/monitoring-monitorability-deep-insights.md`; complete raw results remain in ignored `test-results`.
- Real isolated Chrome Native Messaging run replays the fresh result from cache, verifies the new insight/question/evidence UI, source anchors for all evidence links, PDF geometry for all seven highlight locations, and filter/zoom/export invariance. Native login is ChatGPT; no API key.
- Unit/integration suite: 27 checks, including two-call ordering/cache, malformed/short source quotations, single-headline evidence rejection, fabricated evidence, cross-page anchoring, generic question rejection, conversation retention and cancellation. Controlled API browser test exercises the two-pass path, title/question search, evidence navigation, follow-up answers, reload and exports.
- Limits: two passes use the same model. Evidence existence is checked automatically; semantic entailment, interest ranking, and questions still require reader judgment. No external-paper search or rendered-figure interpretation is included.

## Method reconstruction 0.6 — 24 October 2026

- The full-paper reconstruction pass produced five valid method objects. Final review selected four method walkthroughs (5, 5, 5 and 6 ordered steps) and four findings. All 90 pages were supplied; completed result: 8 insights, 25 evidence links, 24 specific questions, no final source rejections. The structured reconstructions explain intervention sensitivity, expert process labels, outcome-property labels, and controlled comparisons/hierarchical resampling.
- Mathematical expressions are checked within a longer verified source quote; short symbols and layout whitespace are supported without accepting invented formulas. Unrecoverable or inapplicable formalism is explicit. Paper examples link to source text; invented examples are labeled illustrative. Reproduction checklists identify unavailable settings and artifacts.
- One initial review failed validation and a subsequent verbose review timed out. Neither was applied. Added private rejection diagnostics and a source-revalidated dossier checkpoint. Final review uses method references plus assessments, avoiding repeated generation of entire walkthroughs; the completed live request resumed the checked dossier.
- 35 unit/integration checks pass, including shallow method rejection, missing formalism, failed-method coverage, reference materialization and inline-method bypass rejection, short formulas, diagnostic/checkpoint resumption and cancellation. Browser checks cover walkthrough display, method context in chat, reload, Markdown method/assessment/transcript preservation and existing PDF interactions. Native browser checks replay the actual live result, verify >=3 distinct methods (actual 4), equation/evidence navigation, complete metadata export, and PDF geometry invariance across zoom.
- Visual QA checks the actual method popup, including reset to the top when switching passages, with assumptions/controls/examples/reproduction in expandable sections. Detailed generated output is in `docs/monitoring-monitorability-deep-insights.md`.
