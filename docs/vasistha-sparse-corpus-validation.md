# Vasistha sparse-corpus Ask validation

Run date: 2026-10-06 (America/Chicago). Answers were uncached (`ANSWER_CACHE_DISABLED=true`) on the production server. Brave search cache was retained.

## Starting state

- Personality ID: `4633d3bf-8e04-4675-999c-208f368179a5`.
- Category: existing `rishi` / Rishis and Sages framework; identity and spelling aliases only.
- Before and after the run: 0 claims, 0 tagged chunks, 0 linked sources. No Vasistha biography or evidence was seeded.
- AI selector renders Vasistha. Resources uses the same Supabase personality list but requires an administrator session to render its selector.

## Provider result

- The direct Google SDK request with `tools: [{ googleSearch: {} }]` returned HTTP 429, status `RESOURCE_EXHAUSTED`: “You exceeded your current quota, please check your plan and billing details.”
- Every Ask request attempted Google once, executed 0 Google search queries, and returned 0 Google-grounded sources. Successful Google-grounded generalization remains unverified.
- Brave fallback was triggered on every request. In the final run, Brave used cached discovery results (0 new paid Brave calls); original pages were fetched again for answer evidence. A prior exploratory run made live Brave calls and confirmed the API returned results.

## Per-question results

| Question | Local records | Google attempts / queries / sources | Brave new calls / cache hits | Live URLs accepted / citations | Model | Latency | Result | Citation IDs |
|---|---:|---:|---:|---:|---|---:|---|---|
| Who is Vasistha? | 0 | 1 / 0 / 0 | 0 / 3 | 3 / 3 | gemini-3.5-flash-lite | 10.46s | complete | valid |
| Why is Vasistha important? | 0 | 1 / 0 / 0 | 0 / 3 | 3 / 3 | gemini-3.5-flash-lite | 6.05s | complete | valid |
| What is the relationship between Vasistha and Vishvamitra? | 0 | 1 / 0 / 0 | 0 / 3 | 3 / 4 | gemini-3.5-flash-lite | 3.69s | complete | valid |
| What role does Vasistha play in the Ramayana? | 0 | 1 / 0 / 0 | 0 / 3 | 3 / 3 | gemini-3.5-flash-lite | 3.14s | complete | valid |
| What is Vasistha known for? | 0 | 1 / 0 / 0 | 0 / 3 | 3 / 3 | gemini-3.7-flash | 5.73s | complete | valid |
| What is Vasistha's connection to the Vedic tradition? | 0 | 1 / 0 / 0 | 0 / 4 | 4 / 2 | gemini-3.7-flash | 17.29s | complete | valid |
| What can actually be said historically about Vasistha? | 0 | 1 / 0 / 0 | 0 / 4 | 2 / 0 | none | 2.37s | abstained | no citations |
| What are the major stories associated with Vasistha? | 0 | 1 / 0 / 0 | 0 / 3 | 3 / 0 | none | 1.89s | abstained | no citations |

Mean latency: **6.33s**; median: **4.71s**. Mean Google queries: **0.00/question**. Mean Brave cache hits: **3.25/question**.

“Live URLs accepted” counts policy-eligible Brave discovery URLs, including pages that did not yield usable passages. The citation check validates cited IDs against the evidence supplied to synthesis; it does not independently prove that every sentence is fully supported. The relationship answer has four citation records across three distinct URLs.

## Sources actually cited

### Who is Vasistha?

- [Valmiki Ramayana digital text](https://www.valmikiramayan.net/utf8/ayodhya/sarga76/ayodhya_76_prose.htm)
- [Cambridge Core scholarship](https://www.cambridge.org/core/journals/highlights-of-astronomy/article/legends-of-vasistha-a-note-on-the-vedanga-astronomy/D321A13F8F5644FEB0260AC13C8C7E1C)
- [Valmiki Ramayana digital text](https://www.valmikiramayan.net/utf8/ayodhya/sarga5/ayodhya_5_prose.htm)

### Why is Vasistha important?

- [Valmiki Ramayana digital text](https://www.valmikiramayan.net/utf8/ayodhya/sarga76/ayodhya_76_prose.htm)
- [Cambridge Core scholarship](https://www.cambridge.org/core/journals/highlights-of-astronomy/article/legends-of-vasistha-a-note-on-the-vedanga-astronomy/D321A13F8F5644FEB0260AC13C8C7E1C)
- [Valmiki Ramayana digital text](https://www.valmikiramayan.net/utf8/ayodhya/sarga5/ayodhya_5_prose.htm)

### What is the relationship between Vasistha and Vishvamitra?

- [Valmiki Ramayana digital text](https://valmikiramayan.net/utf8/baala/sarga54/bala_54_prose.htm)
- [Cambridge Core scholarship](https://www.cambridge.org/core/journals/journal-of-the-royal-asiatic-society/article/abs/ii-visvamitra-vasistha-hariscandra-and-sunahsepa/35D21CA5E42342B71D6BC7725F2C814A)
- [Valmiki Ramayana digital text](https://www.valmikiramayan.net/utf8/baala/sarga64/bala_64_prose.htm)

### What role does Vasistha play in the Ramayana?

- [Valmiki Ramayana digital text](https://www.valmikiramayan.net/yuddha/sarga128/yuddha_128_prose.htm)
- [Valmiki Ramayana digital text](https://www.valmikiramayan.net/utf8/ayodhya/sarga5/ayodhya_5_prose.htm)
- [Valmiki Ramayana digital text](https://www.valmikiramayan.net/utf8/ayodhya/sarga76/ayodhya_76_prose.htm)

### What is Vasistha known for?

- [Valmiki Ramayana digital text](https://www.valmikiramayan.net/utf8/ayodhya/sarga76/ayodhya_76_prose.htm)
- [Cambridge Core scholarship](https://www.cambridge.org/core/journals/highlights-of-astronomy/article/legends-of-vasistha-a-note-on-the-vedanga-astronomy/D321A13F8F5644FEB0260AC13C8C7E1C)
- [Valmiki Ramayana digital text](https://www.valmikiramayan.net/utf8/ayodhya/sarga5/ayodhya_5_prose.htm)

### What is Vasistha's connection to the Vedic tradition?

- [Valmiki Ramayana digital text](https://valmikiramayan.net/utf8/baala/sarga7/bala_7_prose.htm)
- [Valmiki Ramayana digital text](https://www.valmikiramayan.net/utf8/baala/sarga22/bala_22_prose.htm)

Accepted but uncited: [Cambridge Core article](https://www.cambridge.org/core/journals/journal-of-the-royal-asiatic-society/article/abs/xii-sagara-and-the-haihayas-vasistha-and-aurva/4611CDACCB29235DD2689A20B850A54D) and [Valmiki Ramayana Yuddha 128](https://www.valmikiramayan.net/yuddha/sarga128/yuddha_128_prose.htm).

### What can actually be said historically about Vasistha?

- None; the answer abstained.
- Accepted discovery URLs: [Valmiki Ramayana Bala 54](https://valmikiramayan.net/utf8/baala/sarga54/bala_54_prose.htm) and [Cambridge Core article](https://www.cambridge.org/core/journals/journal-of-the-royal-asiatic-society/article/abs/ii-visvamitra-vasistha-hariscandra-and-sunahsepa/35D21CA5E42342B71D6BC7725F2C814A).

### What are the major stories associated with Vasistha?

- None; the answer abstained.
- Accepted discovery URLs: [Valmiki Ramayana Ayodhya 76](https://www.valmikiramayan.net/ayodhya/sarga76/ayodhya_76_prose.htm), [Cambridge Core article](https://www.cambridge.org/core/journals/highlights-of-astronomy/article/legends-of-vasistha-a-note-on-the-vedanga-astronomy/D321A13F8F5644FEB0260AC13C8C7E1C), and [Valmiki Ramayana Ayodhya 90](https://www.valmikiramayan.net/utf8/ayodhya/sarga90/ayodhya_90_prose.htm).

## Example answer: Who is Vasistha?

Vasistha is a prominent sage and royal priest featured in Hindu epic literature, most notably in the *Valmiki Ramayana* [S1, S3]. As the preceptor to the royal family of Ayodhya, he plays a crucial advisory role in major dynastic and state events [S1, S3]. 

Within the epic narrative, Vasistha guides both royal princes and grieving family members through critical moments [S1, S3]. He interacts directly with figures such as Rama, Sita, and Bharata [S1, S3]. For instance, Vasistha informs Rama of his impending consecration as king, instructs him and Sita to undertake ritual fasting with mantras, and receives their respectful worship before proceeding with royal duties [S3]. Following the death of King Dasaratha, Vasistha provides vital counsel to Bharata, advising him to cease his lamentation and properly oversee the king's final funeral rites [S1]. 

Beyond his narrative role in the epics, Vasistha is also associated with broader traditions of ancient scholarship, including Vedic astronomy [S2].

## Conclusion

The database-driven Ask path answered several questions about a new personality without personality-specific application branches. The real Google Search path did not complete a single query because of provider quota. Brave fallback supplied request-scoped original-source evidence and did not add approved permanent DCF resources. Two broad or historical questions abstained, and answer breadth remains bounded by the credible material found.
