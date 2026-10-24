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
