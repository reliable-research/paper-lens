# Local Codex: subscription-based paper analysis

Paper Lens 0.5 defaults to **Local Codex**, using the Codex CLI signed in with ChatGPT. No API key is needed. This is a local/open-source integration. It still sends the extracted paper to OpenAI and consumes the signed-in user's subscription allowance; it is not on-device model inference or unlimited usage. If the CLI is signed in with an API key, the companion refuses the request. It never silently switches to API billing.

## macOS setup

1. Install Node.js 22.13+ and the official Codex CLI. Run `codex login` and choose ChatGPT. Verify `codex login status` says `Logged in using ChatGPT`.
2. Load/reload the extension in Chrome. Open its gear icon. **Local Codex** is the default; the setup details show your exact extension ID.
3. From the repository run `npm run install:companion -- --extension-id YOUR_CHROME_EXTENSION_ID`. For the separate companion ZIP, unzip it and run `node companion/install.mjs --extension-id YOUR_CHROME_EXTENSION_ID` from that extracted folder. If your ID matches the stable development ID in manifest.json, the argument is optional. Pass `--codex /absolute/path/to/codex` if Codex is not on PATH.
4. Click **Check Codex connection**. It should report **Connected · ChatGPT subscription · no API key**.
5. Open any PDF or the Monitoring Monitorability demo and click **Find insights with local Codex**. The demo initially shows its included source-checked guide; clicking Find insights runs two full-paper passes and generates an evidence-linked guide (or restores a matching cached result).

The installer copies the companion into `~/Library/Application Support/Paper Lens` and registers `org.reliable_research.paper_lens` in `~/Library/Application Support/Google/Chrome/NativeMessagingHosts`. Chrome starts this process only when the extension connects. Node and Codex paths are recorded explicitly so Chrome does not need to inherit your shell PATH. Only the exact extension ID is allowed. Re-running setup replaces this companion registration; run again if you change the extension ID or Node/Codex location. Linux Chrome is also supported by the installer using standard per-user paths; macOS is the tested platform. Other Chromium browsers require separate host registration and are not claimed tested.

## How it works (including page coordinates)

1. The extension fetches the PDF and uses PDF.js to extract all pages and build a normalized text-to-source-item map. A paper URL is not treated as if it already contains the paper text.
2. Chrome Native Messaging sends numbered page text, reading interests, optional selected quote and optional model ID to the local companion. It does not send browser cookies, API keys, login tokens, arbitrary command arguments or local file paths.
3. The companion verifies ChatGPT login, strips API credentials from the child environment, ignores user provider configuration, forces ChatGPT authentication, and runs Codex in a temporary working directory with a read-only sandbox. Shell execution, app/browser/computer tools and web search are disabled. Only the PDF text and structured analysis request are required.
4. Codex returns JSON: summary and highlights containing exact source quote, page, section, category, explanation and significance. The LLM does not calculate x/y coordinates.
5. The companion rejects source quotations not found on the returned page. The extension independently verifies every remaining quote and resolves its source text item offsets.
6. PDF.js text-layer geometry yields on-page rectangles. The extension converts the viewport rectangles into PDF points (origin at bottom-left), so zoom does not change the document coordinates. The export includes `pdfSha256`, page, exact quote, source offsets, explanation and `geometry.rects` with `x`, `y`, `width`, `height` in PDF points.

One quote may span several lines and therefore has several rectangles. Missing or ambiguous text layers still need OCR or layout recovery. Source matching verifies quotations, not the correctness of the LLM's interpretations.

## Caching, cancellation and data

A local cache key includes the full extracted text, reading interests, focused quote, explicit model choice and analysis-prompt version. Repeated matching requests restore source-verified analysis without model inference. A blank model uses the Codex default; changes to that default are not automatically part of the cache key. Cache files are in `~/Library/Application Support/Paper Lens/cache`, readable only by the user. They contain result quotes/explanations and token usage, not the complete prompt or authentication credentials. Per-request temporary files are removed. The existing Codex credentials remain managed by Codex, outside the extension.

Cancel stops the child request and preserves current annotations. Closing the reader disconnects the native host and cancels active analysis. No always-running web server or broad shell RPC is exposed. Native messages and paper length are bounded; oversized papers are refused instead of truncated. Subscription exhaustion/auth/model errors are reported rather than falling back to API. Existing annotation JSON/Markdown exports do not contain credentials.

To uninstall, remove the host manifest above and the Paper Lens application-support directory. This removes the companion/cache, not your Codex login. Chrome extension notes are separate browser storage.

## Published Chrome extension

A Chrome Web Store extension cannot bundle an executable and silently install/run it. Users install **both** the store extension and the companion on their own computer, and sign into Codex locally. The companion's allowed_origins must contain the actual Web Store extension ID; the manifest key in this repository fixes only the unpacked development ID. Before store publication, use the store-assigned key/ID and publish an appropriately signed/notarized companion installer, permission disclosure and privacy policy. This update is pushed to GitHub; it is not a store submission.

Chrome Native Messaging: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
Codex ChatGPT authentication: https://learn.chatgpt.com/docs/auth
Codex app integration guidance: https://learn.chatgpt.com/docs/app-server#auth-endpoints

## Test the real paper

`npm run fetch:paper` downloads the ignored, hash-checked PDF. `node scripts/live-codex.mjs` performs a real analysis through the installed native host using your current subscription. It writes local-only `test-results/live-codex-result.json` and `live-codex-report.json`. It consumes subscription usage only on a cache miss. `npm run test:browser` checks viewer/API regression behavior; `node tests/native-browser.mjs` checks the installed host and cached real result inside Chrome. No authentication tokens are exported or committed.
