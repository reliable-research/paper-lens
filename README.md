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

## Three clearly labeled modes

- **Included source-checked guide:** Monitoring Monitorability (arXiv:2512.18311v1), downloaded directly from arXiv when you open the demo. All 90 pages are parsed, and 16 pre-authored passages across 10 pages have exact source anchors and explanations. Includes the two-run RL qualification, targeted obfuscation, evaluation design and scaling limitations. This guide is bundled and is not presented as newly generated AI analysis.
- **Local sentence ranking:** Automatically reads all pages and selects section-aware reading cues without sending text anywhere. These explanations describe the sentence's role, not a semantic paraphrase. The heuristic can select imperfect passages, especially from complex layouts, headings, captions or appendices.
- **AI analysis:** Configure an HTTPS or localhost OpenAI-compatible Chat Completions endpoint, model and optional key under the gear icon. Click **Analyze with AI** to send all extracted pages and interests to that provider. Select a model with sufficient context (the test PDF contains 203,873 extracted characters, plus request instructions and output). No content is silently truncated; documents above 600,000 extracted characters are rejected before a request. Returned quotations must be exact normalized text from a single page or they are discarded. Explanations are model-generated and require reader judgment; source anchoring verifies the quote, not the interpretation.

Example endpoint shape: `https://YOUR-PROVIDER/v1/chat/completions`. Use the exact endpoint/model documented by your provider. Some providers do not support this API shape, `max_tokens`, or this context length. No API key or provider subscription is included. HTTPS endpoints must allow browser/extension API calls; localhost servers may require CORS configuration. API redirects are rejected to avoid forwarding credentials to another endpoint.

## Reading

- Click any colored highlight on the page or a reading-map card to see its explanation in the right margin.
- Filter by motivation, contribution, method, result, or limitation. Search quotes, explanations, section names and notes.
- Select text on one page, then **Highlight & explain** to create a personal annotation. Add notes immediately, or use **Explain with AI** for full-paper context.
- Notes save automatically by PDF fingerprint. Reopen the same PDF to restore them. The most recent PDF is cached in IndexedDB for reload; other PDFs must be reopened using the file picker or URL.
- **Export** saves Markdown or JSON with quotes, page numbers, explanations and personal notes. It does **not** embed annotations into the PDF bytes, export an annotated PDF, or sync across devices.
- Zoom and page navigation are supported. Pages render lazily, but extraction processes every page before analysis.

## Data and permissions

PDF extraction, local ranking, the included guide, and notes work without an account or external AI. ArXiv permission is installed by default for opening papers. Other HTTPS hosts and localhost AI endpoints request access only on use. There are no analytics or publisher servers. Online PDF loading contacts the document host. Clicking AI analysis sends the complete extracted paper to the configured endpoint, including appendices/references and any personal interests you entered.

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
```

Without a downloaded source PDF the real-paper integration test is explicitly skipped. `npm run fetch:paper` downloads the unchanged source into ignored local storage; run this before browser tests.

`npm test` checks normalization, source anchoring, hallucinated quote rejection, section coverage including post-reference appendices, reanalysis note merges, complete provider requests and context-limit refusal. `test:browser` loads the real Manifest V3 extension in an isolated Playwright Chromium profile and checks the 90-page source, all guide-page highlight geometry, source clicks, notes/reload, filters, JSON export, local analysis, zoom and a mocked full-paper provider. The mock verifies transport and UI behavior; it does not establish live model quality. See `test-results/browser-report.json` and screenshots after running.

The source PDF is not redistributed in this repository or package. The demo downloads it directly from https://arxiv.org/pdf/2512.18311v1. `scripts/extract.mjs` regenerates extracted text; `scripts/build-guide.mjs` checks all curated quote anchors. The PDF's original license/attribution remain with its authors; see THIRD_PARTY.md.
