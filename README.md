# Paper Lens

A Chrome extension for reading an entire research PDF, marking core passages across sections, and attaching explanations to those exact source passages.

## Install (no build step)

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top right).
3. Choose **Load unpacked** and select the `paper-lens` folder containing `manifest.json` (or `dist/paper-lens` if using the packaged release).
4. Pin **Paper Lens** to the toolbar. Click it to open the reader.
5. Click **Read Monitoring Monitorability** to download and open the test paper from arXiv, or **Open PDF** to choose your own file.

When viewing an online PDF, click the extension toolbar icon to open that URL in Paper Lens. arXiv abstract URLs are converted to PDF URLs. Other website access is requested per origin. If you open a non-PDF page, choose a PDF file or use **From link**. For local files, use the file picker; no file-URL permission is needed.

The extension opens its own PDF.js viewer in a Chrome tab. It preserves the original pages and draws annotations over them; it does not inject into Chrome's protected native PDF viewer.

## Local Codex is the default

Use your existing ChatGPT subscription through the local Codex CLI, without an API key. Install Node.js and Codex CLI, sign in with `codex login`, and run `npm run install:companion` from this repository. Reload the extension, open the gear icon and choose **Check Codex connection**. Then open the paper and click **Find insights with local Codex**. The companion is already installed on the development Mac; other users install it once on their own computer. For a different extension ID use the exact setup command shown in settings.

[Full setup and published-extension architecture](docs/local-codex.md). API billing remains an optional, explicitly selected mode; there is no automatic fallback. Local Codex still sends text to OpenAI and consumes subscription limits.

## Four clearly labeled modes

- **Included source-checked guide:** Monitoring Monitorability (arXiv:2512.18311v1), downloaded directly from arXiv when you open the demo. All 90 pages are parsed, and 16 pre-authored passages across 10 pages have exact source anchors and explanations. Includes the two-run RL qualification, targeted obfuscation, evaluation design and scaling limitations. This guide is bundled and is not presented as newly generated AI analysis.
- **Local sentence ranking:** Automatically reads all pages and selects section-aware reading cues without sending text anywhere. These explanations describe the sentence's role, not a semantic paraphrase. The heuristic can select imperfect passages, especially from complex layouts, headings, captions or appendices.
- **Local Codex (default):** A local Native Messaging companion runs the ChatGPT-authenticated Codex CLI. The entire extracted paper is supplied for semantic selection and explanations. The companion and extension verify source quotes; a content-based cache avoids repeated inference for the same paper/interests/model. No API key or local HTTP server is needed.
- **API analysis (optional):** Explicitly select API endpoint in settings. Configure an HTTPS or localhost OpenAI-compatible Chat Completions endpoint, model and optional key under the gear icon. Click **Find insights with API** to send all extracted pages and interests to that provider. Select a model with sufficient context (the test PDF contains 203,873 extracted characters, plus request instructions and output). No content is silently truncated; documents above 600,000 extracted characters are rejected before a request. Returned quotations must be exact normalized text from a single page or they are discarded. Explanations are model-generated and require reader judgment; source anchoring verifies the quote, not the interpretation.

Example endpoint shape: `https://YOUR-PROVIDER/v1/chat/completions`. Use the exact endpoint/model documented by your provider. Some providers do not support this API shape, `max_tokens`, or this context length. No API key is included for this optional API mode; local Codex uses the user's existing ChatGPT sign-in. HTTPS endpoints must allow browser/extension API calls; localhost servers may require CORS configuration. API redirects are rejected to avoid forwarding credentials to another endpoint.

## Reading

- Hover over or click a colored highlight or its category tag to open a floating insight and passage chat. It stays open while the pointer is over the passage or popup, then disappears when you move away. Reading-map cards also open explanations. The popup omits the heading, page label, and source quotation already visible in the PDF.
- The header starts hidden; **Tools** reveals it. **Map** shows or hides the Reading map. Zooming in automatically hides the map, and **Fit** returns the PDF to the available width. On narrow windows the map opens as a drawer.
- Filter by motivation, contribution, method, result, or limitation. Search insight titles, questions, evidence reasons, quotations, explanations and saved conversations.
- Select text on one page, then **Discuss selection** to create a personal annotation and ask questions with full-paper context through the selected backend.
- Notes save automatically by PDF fingerprint. Reopen the same PDF to restore them. The most recent PDF is cached in IndexedDB for reload; other PDFs must be reopened using the file picker or URL.
- **Export** saves Markdown or JSON with PDF SHA-256, quotes, page numbers, explanations, personal notes and highlight rectangles in PDF points (origin at bottom-left). Coordinates are computed by PDF.js, not predicted by the LLM. It does **not** embed annotations into the PDF bytes, export an annotated PDF, or sync across devices.
- Zoom and page navigation are supported. Pages render lazily, but extraction processes every page before analysis.

## Data and permissions

PDF extraction, local ranking, the included guide, and notes work without an account or external AI. ArXiv permission is installed by default for opening papers. Other HTTPS hosts and localhost AI endpoints request access only on use. The nativeMessaging permission lets Chrome connect to the separately installed companion restricted to this extension ID. There are no analytics, publisher servers, or localhost HTTP listeners. Online PDF loading contacts the document host. Clicking Local Codex analysis sends the complete extracted paper through Codex to OpenAI; optional API analysis sends it to the configured endpoint, including appendices/references and any personal interests you entered.

Settings and annotations are stored in browser localStorage, and the latest PDF in IndexedDB. API keys are session-only by default; the optional Remember checkbox stores the key **unencrypted in this extension's localStorage**. Keys are never included in exports. Clear extension storage or remove the extension to delete locally saved data. Unchecking Remember and saving settings removes a stored key.

Text-layer PDFs only: no OCR, semantic figure reading, equation image interpretation, or guaranteed multi-column reading-order recovery. A source quote split across a page boundary cannot currently be highlighted as one unit. Local highlights are a reading aid, not a claim of exhaustive coverage. AI errors/timeouts retain existing annotations. This is an unpacked MVP, not a Chrome Web Store publication.

## Development and verification

Requires Node.js 22+ and npm.

```sh
npm ci
npm test
npm run fetch:paper  # optional integration fixture, fetched from arXiv and hash checked
npm test            # now includes the full 90-page integration test
npx playwright install chromium
npm run test:browser
npm run package
# Optional: install local companion and exercise real ChatGPT-subscription analysis
npm run install:companion
node scripts/live-codex.mjs
node tests/native-browser.mjs
```

Without a downloaded source PDF the real-paper integration test is explicitly skipped. `npm run fetch:paper` downloads the unchanged source into ignored local storage; run this before browser tests.

`npm test` checks normalization, source anchoring, hallucinated quote rejection, section coverage including post-reference appendices, reanalysis note merges, complete provider requests and context-limit refusal. `test:browser` loads the real Manifest V3 extension in an isolated Playwright Chromium profile and checks the 90-page source, all guide-page highlight geometry, source clicks, notes/reload, filters, JSON export, local analysis, zoom and a mocked full-paper provider. The API mock verifies transport and UI behavior. The separate live-Codex/native-browser tests exercise the real local subscription integration; see docs/verification.md. See `test-results/browser-report.json` and screenshots after running.

The source PDF is not redistributed in this repository or package. The demo downloads it directly from https://arxiv.org/pdf/2512.18311v1. `scripts/extract.mjs` regenerates extracted text; `scripts/build-guide.mjs` checks all curated quote anchors. The PDF's original license/attribution remain with its authors; see THIRD_PARTY.md.

### Passage conversations

Select text and choose **Discuss selection**, or hover/click an existing highlight. The popup offers three quick questions and a chat box. Questions use the whole PDF and recent conversation through the configured local Codex subscription (default) or API backend. Answers and drafts are saved with each passage and survive reload/reanalysis. Suggested questions are local category-based shortcuts; answers are generated after you choose one or send your own question.

Upgrading from 0.3: reload the unpacked extension and rerun `npm run install:companion -- --extension-id <your-extension-id>` so local Codex receives the new question/history fields.

## Deep insights (0.5)

**Find insights with local Codex** now runs two distinct passes over the full extracted paper:

1. Reconstruct the argument: central question, prior expectation described by the authors, claims, mechanisms, alternative explanations, and cross-section evidence. Source-check every candidate quotation before review.
2. Challenge and rank: re-read the paper against that dossier, remove obvious/redundant/unsupported candidates, and select the most informative insights without a section quota.

Each insight shows what is interesting, how it works, supporting and qualifying/challenging evidence, uncertainty, and three paper-specific questions. Evidence buttons navigate to and select the original text, including in appendices. The Reading map lists new insights in model-ranked order; saved personal annotations are retained. Markdown/JSON exports preserve these details and conversations. Focused chat remains a single request. API mode uses the same two-pass workflow.

The two passes use the same configured model; this is a structured review, not independent verification. Source checks establish quotation locations, not whether an interpretation is correct or novel. No external comparison papers are fetched, so prior-work comparisons are limited to the loaded paper's account. Analysis currently uses extracted text, not rendered figures; missing visual/numerical evidence must be qualified. The old local sentence ranker and included demo guide remain available and are distinct from deep AI analysis.

[Monitoring Monitorability: actual generated insights and evidence links](docs/monitoring-monitorability-deep-insights.md). The 0.5 subscription test produced 7 insights, 28 evidence links and 21 questions across all 90 pages; the current 0.6 method-focused example contains 8 insights, including 4 detailed method walkthroughs, 25 evidence links and 24 questions. Reinstall the companion when upgrading to 0.5 (the installed copy on the development Mac has already been updated), then reload the unpacked extension. Previous cached AI analyses use a different pipeline version and cannot replace the new result.

## Method reconstruction (0.6)

The two-pass analysis now reconstructs core methods before selecting findings. Method insights have a structured walkthrough: goal, inputs and outputs, ordered procedure with step-by-step rationale, equations/definitions and symbol meanings, assumptions, actual versus proposed controls, a worked example, and a reproduction checklist with missing artifacts/settings identified. For method-rich papers the analysis preserves several distinct method components instead of replacing them with general caveats.

Expand **Equations and definitions**, **Assumptions**, **Controls and ablations**, **Worked example**, or **Reproduce this method** in a method popup. Equation and paper-example links select their cited PDF text. Invented examples are explicitly illustrative. Equations must be recovered from a verified source quote; missing or inapplicable formalism must be explained explicitly, and incomplete method objects cannot pass as method highlights. Chat receives the displayed steps as model-generated context, so follow-up questions can refer to the walkthrough. Markdown and JSON preserve the method reconstruction.

The analysis cache version changes for this release. Reinstall the companion and rerun **Find insights with local Codex** after reloading the extension. The development Mac's companion is updated during verification.

The review selects validated method reconstructions by reference and adds an assessment; it does not regenerate the whole procedure. A failed review preserves a private diagnostic draft, while the validated dossier can be reused on a later attempt. No rejected output is applied to highlights.
