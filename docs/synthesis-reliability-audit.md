# Fresh Gemini synthesis reliability audit

## Path and causes

The /ai page loads personalities, then renders the shared Ask client. Ask POSTs to /api/ask; that route calls answerQuestion, which retrieves approved evidence, builds a bounded packet and prompt, checks the answer cache, then calls GeminiSynthesisProvider. The provider calls generateText through the installed @google/genai SDK. Citation validation and the epistemic safeguard run after a model response; deterministic fallback remains the final safety net.

The prior default was gemini-3.8-flash with an actual 25-second default/cap despite the documented 40 seconds. Direct account model listing showed 3.8 Flash, 3.7 Flash and 3.5 Flash-Lite all support generateContent, so the model IDs and SDK method were valid. A tiny 3.8 probe took about 13 seconds and used its 32-token output budget on thinking. A later 3.8 probe returned HTTP 503 UNAVAILABLE with an explicit high-demand message; a full request timed out at 40 seconds. A direct 3.7 probe succeeded in 5.8 seconds, and 3.5 Flash-Lite succeeded in under one second. Google's [model catalog](https://ai.google.dev/gemini-api/docs/models) lists these model families, and its [API error guide](https://ai.google.dev/gemini-api/docs/api-errors) classifies 503 as temporary service overload.

The application also misclassified a real HTTP 503 as MODEL_UNAVAILABLE because the body said “This model is currently experiencing high demand” and “UNAVAILABLE.” That opened a nontransient circuit and suppressed the alternate. Classification now uses HTTP status first: 503 is TRANSIENT; 404 is MODEL_UNAVAILABLE. Provider class, HTTP status and provider code are logged without logging credentials, prompts or answer text.

## Configuration and strategy

Before: default gemini-3.8-flash, one synthesis call, 25-second effective cap, 2,048 output tokens, no alternate. After: default gemini-3.7-flash, 40-second default with a 45-second cap, low thinking level for Gemini 3 synthesis, and at most one alternate call to gemini-3.5-flash-lite after a 503/network failure or timeout. The model IDs and timeout remain configurable server-side. Quota, rate, authentication, malformed request, unsupported model, context-limit, empty-response and citation-validation failures do not cause an alternate request. A transient primary circuit can route directly to the alternate during cooldown.

Server logs for each attempt include model, duration, evidence record/character counts, prompt characters, estimated prompt tokens, requested output tokens, actual prompt/response tokens when returned, finish reason, success, error class, HTTP status, provider code and category. Separate events record citation validation, alternate selection and fallback. ANSWER_CACHE_DISABLED=true bypasses both reads and writes for development audits.

The packet was not compacted because measurement ruled out context pressure. For the identical “Why is Vishvamitra important?” request, both before and after the provider change used 15 records, 9,887 evidence characters and a 12,319-character prompt (about 3,080 estimated tokens; 2,907 actual input tokens on success). The broad packet fits far below the listed models' 1,048,576-token input limit. Requested output stayed at 2,048 tokens. Across the final audit, prompts were 6,420–12,319 characters and successful responses reported 1,514–2,907 input tokens.

## Uncached audit

Seventeen questions were sent sequentially against the current Vishvamitra corpus with answer-cache reads and writes disabled. All 16 answerable questions received fresh Gemini synthesis: 3 on the 3.7 primary and 13 on 3.5 Flash-Lite. One question abstained before generation; zero used deterministic fallback. There were 20 provider attempts: 3 primary successes, 4 primary HTTP 503 TRANSIENT failures, and 13 alternate successes. Four alternate calls followed a same-request primary failure; the other nine were routed directly while the primary transient circuit was open. There were no 429, 400, 401/403, 404, SDK mismatch, context-limit, empty-response or citation-validation failures in this audit. Median successful synthesis latency was 3,101 ms (generation only). All 16 model outputs passed server-side citation validation.

| # | Question | Fresh model | Calls | Synthesis ms | Fresh AI | Fallback | Abstained | Server citation check |
|---:|---|---|---:|---:|---|---|---|---|
| 1 | Who is Vishvamitra? | 3.5 Flash-Lite | 2 | 8463 | yes | no | no | passed |
| 2 | Why is Vishvamitra important? | 3.5 Flash-Lite | 1 | 2272 | yes | no | no | passed |
| 3 | How does Vishvamitra change across the Rigveda and Ramayana? | 3.5 Flash-Lite | 1 | 1803 | yes | no | no | passed |
| 4 | What is historically known about Vishvamitra? | 3.5 Flash-Lite | 1 | 2810 | yes | no | no | passed |
| 5 | What is the relationship between Vishvamitra and Vasistha? | 3.5 Flash-Lite | 2 | 6676 | yes | no | no | passed |
| 6 | What role does tapas play in Vishvamitra's story? | 3.5 Flash-Lite | 1 | 1573 | yes | no | no | passed |
| 7 | How do scholars interpret Vishvamitra's transformation? | 3.5 Flash-Lite | 1 | 7947 | yes | no | no | passed |
| 8 | What is contested about Vishvamitra? | 3.5 Flash-Lite | 1 | 2301 | yes | no | no | passed |
| 9 | How did later traditions reinterpret Vishvamitra? | 3.7 Flash | 1 | 11265 | yes | no | no | passed |
| 10 | What can we actually say with confidence about Vishvamitra? | 3.7 Flash | 1 | 3101 | yes | no | no | passed |
| 11 | What role did Vishvamitra play in Rama’s story? | 3.5 Flash-Lite | 2 | 4529 | yes | no | no | passed |
| 12 | Why did Vishvamitra take Rama with him? | 3.5 Flash-Lite | 1 | 1485 | yes | no | no | passed |
| 13 | What are Bala and Atibala in the Ramayana account? | 3.5 Flash-Lite | 1 | 1171 | yes | no | no | passed |
| 14 | What does Rigveda 3.33 say about Vishvamitra? | — | 0 | 0 | no | no | yes | n/a |
| 15 | Who recognizes Vishvamitra as Brahmarshi in the Ramayana? | 3.7 Flash | 1 | 5494 | yes | no | no | passed |
| 16 | Which Rigveda mandala is associated with Vishvamitra? | 3.5 Flash-Lite | 2 | 7558 | yes | no | no | passed |
| 17 | How does the Mahabharata portray Vishvamitra and Vasistha? | 3.5 Flash-Lite | 1 | 1870 | yes | no | no | passed |

The local audit script's simple citation parser did not understand grouped references such as [C2, C3]; the server validator accepted all 16 model responses and is authoritative for the last column. Historical and contested answers continued to distinguish textual attribution, later narrative and historical uncertainty. The existing epistemic safeguard and citation regression tests also passed. The one abstention was “What does Rigveda 3.33 say about Vishvamitra?”, which retrieval marked unanswerable before generation; this task did not change retrieval.
