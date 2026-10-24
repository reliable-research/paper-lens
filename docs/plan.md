# Paper Lens Implementation Plan

Goal: installable extension with demonstrable full-PDF highlights and anchored explanations.
Architecture: packaged PDF.js + vanilla ES modules; extraction/anchor/model validation separated from viewer; IndexedDB PDF cache and localStorage annotation persistence; optional provider API.

1. Write failing tests for wrapped/ligature quote anchoring, exact quote rejection, section coverage and AI response validation.
2. Implement extraction and local selection; build a verified guide from real test PDF text.
3. Implement extension launch, lazy PDF rendering, highlight overlays, explanation/notes panel, filters, source navigation, exports, and AI settings.
4. Run unit tests and browser integration against the actual PDF and loaded extension, including persistence and malformed API responses.
5. Inspect screenshots, repair defects, package extension and document installation and limitations.

Risk checks: no silent truncation of AI context; no made-up quote anchors; no stale analysis overwriting another document; no raw API response HTML; no API key in exports; no scan presented as analyzed. Source test PDF is arXiv:2512.18311v1, fetched from arXiv without modification and excluded from Git.
