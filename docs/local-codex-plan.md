# Local Codex implementation

User-approved scope: default to existing ChatGPT-authenticated Codex CLI, analyze the real 90-page Monitoring Monitorability PDF, and push to reliable-research/paper-lens. Keep optional API mode.

Architecture: Chrome Native Messaging (no HTTP listener) -> user-installed Node companion -> Codex exec with existing ChatGPT authentication, read-only sandbox and shell/apps/browser tools disabled -> JSON schema output. The extension transmits extracted page text; Codex chooses exact quotes and explains their significance. The extension independently resolves quotes into PDF text items and computes viewport rectangles, and exports normalized page coordinates. The LLM never invents pixel coordinates.

1. Tests first: framing/limits, request validation, API-key rejection, sanitized environment, cache identity, native-client cancellation/error paths.
2. Implement runner, framed native host and per-user macOS/Linux installer with exact allowed extension IDs and fixed executable paths. No credentials exposed to Chrome. Fail closed on API login; never fall back to paid API.
3. Default UI to Local Codex, provide connection check/setup instructions, preserve API mode explicitly, add cancellation and a content-based result cache.
4. Full live run through the native host with existing ChatGPT login; retain evidence locally. Browser roundtrip through installed native host; use result cache to avoid repeated subscription usage. Inspect rectangle geometry and explanations.
5. Review changes, update setup/deployment documentation, package, verify and push.

Published deployment requires TWO installations: Web Store extension and separate local companion + Codex CLI. Store extension ID is registered in allowed_origins. This repo's stable unpacked ID is for development; it does not claim store publication or bypass the Chrome installation policy. Local Codex still sends text to OpenAI and consumes subscription limits.
