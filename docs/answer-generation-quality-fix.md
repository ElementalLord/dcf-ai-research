# Answer generation quality audit

## Diagnosis

The Ask path retrieves approved claims and passages, calls `buildBoundedContext`, then attempts Gemini once. A valid cached Gemini answer is reused when present. An unavailable provider, timeout, or invalid citation switches to the deterministic provider. The old deterministic provider was extractive: it printed up to eight claim or passage blocks, often including 560 characters of each record, with source metadata beneath each. The old prompt told Gemini to explain and cite but did not clearly permit paraphrase and cross-source synthesis. The packet mixed propositions with long passages and repeated metadata without exposing all epistemic fields.

The live baseline for “Why is Vishvamitra important?” selected 15 records and attempted Gemini once; a provider failure led to seven source blocks, including a long Ramayana passage. The answer began with a Rigveda detail instead of a direct conclusion.

## Changes

- Prompt version `grounded_synthesis_v4` explicitly asks for an answer-first synthesis, grouping evidence by conclusion, paraphrasing, selective quotation, and depth-specific treatment. It retains supplied-evidence-only factual grounding, supplied citation IDs, narrative/history distinctions, and abstention.
- The bounded packet keeps citation identity but deduplicates repeated propositions across parameters. Each claim now exposes its proposition, a short supporting excerpt when present, work, locator, textual layer, source type, epistemic type, evidence type, support status, certainty, and contested flag. Passage bodies are capped at 380 characters. Personality labels remain for comparisons.
- The deterministic fallback prefers short structured claims, filters methodological records, deduplicates repeated propositions, selects evidence against question terms and scope, and limits the output by depth mode. Broad profiles prefer a cross-layer overview claim. Historical questions lead with the evidentiary limit; a packet with no relevant historical/textual support abstains. Textual comparisons explicitly separate early attribution from later narrative. Passage-only answers remain brief.
- `debug.synthesisMode` reports `Gemini`, `cached gemini`, `Deterministic fallback`, or `none`. Normal Ask UI only shows a plain-language fallback note.

## Live regression sample

Thirteen questions were sent to the current Vishvamitra corpus: the ten broad/focused prompts in the request plus three narrower questions about Rigveda 3.33, Rama, and Bala/Atibala. In the final full run, **10/13 (77%)** delivered deterministic fallback summaries, **1/13 (8%)** reused a cached Gemini answer, and **2/13 (15%)** abstained. No fresh Gemini answer completed in that run: two requests attempted generation and ended in timeout or transient failure; the provider circuit suppressed further attempts. An earlier run did complete one fresh Gemini answer for the Rama question. These counts diagnose provider availability in this environment, not Gemini's prose quality under the new prompt.

The fallback changed the broad “Who is Vishvamitra?” answer from a series of claim and passage excerpts to a direct Vedic-seer/epic-teacher overview with three cited paragraphs. “Why is Vishvamitra important?” now begins with those two supported roles rather than a source heading and a quotation. “What is historically known?” opens with the limit on historical biography and then cites Rigvedic attribution. A comparative Rigveda/Ramayana answer distinguishes early seer attribution from the later royal-to-ascetic narrative.

Remaining evidence limitation: the selected packet for “What can we actually say with confidence?” consisted mainly of modern reflection, so the deterministic path abstained. “What does Rigveda 3.33 say?” was already marked unanswerable by retrieval. The fallback cannot repair an unresponsive packet, and the successful Gemini sample was too small to establish broad-question Gemini quality. Those cases need separate retrieval/coverage work, outside this generation-only change.

Citation IDs still map to approved selected records; generated citations are validated; historical and contested-claim safeguards remain in place. The answer cache is invalidated by the prompt version change.
