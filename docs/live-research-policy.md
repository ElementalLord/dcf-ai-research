# DCF live-research policy

DCF searches to close an evidence gap, not merely because web search is available.

## Search hierarchy

1. Retrieve approved DCF Library evidence and assess whether it directly covers the question.
2. If a gap remains, create one or two question-directed intents: primary source, exact work, scholarly assessment, institutional record, historical context, or controversy/priority.
3. Use Gemini with Google Search first. Its summary and snippets are discovery leads only.
4. Fetch the original pages through DCF's safe-fetch boundary and admit only relevant passages.
5. Use Brave only when Google does not yield sufficient readable evidence, its result set is too narrow, or a complex claim still needs an independent work.
6. Answer from the strongest compact evidence set, or abstain.

`Approved Sources Only` with zero allowed domains disables live research. DCF never silently broadens that policy.

## What DCF evaluates

Publisher authority, evidence type, passage support, claim certainty, and accessibility are separate fields.

- Publisher authority: authoritative, credible secondary, or general web. Domain patterns and administrator rules are signals, not proof of relevance.
- Evidence type: primary document, traditional text, scholarly interpretation, institutional record, edited secondary source, or general web.
- Passage support: EXACT, STRONG, PARTIAL, or RELATED. EXACT and STRONG normally anchor factual statements; PARTIAL requires narrower language; RELATED is context/discovery only.
- Accessibility: readable, bibliographic only, or unreadable. A 401/402/403/429/451 result can remain a bibliographic lead but is never represented as read evidence.

Traditional and religious texts establish what a text states or narrates. They do not, by themselves, establish that an event happened historically. Institutional records can establish dates and internal actions, but claims about impact or importance normally need independent assessment.

## Source identity and independence

DCF preserves title, author, publisher, date, journal, DOI, ISBN, locator, and retrieval time when available; it does not invent missing metadata. DOI or ISBN identifies a work most strongly. Otherwise a normalized title/author key or conservative canonical-page key is used.

PDF and HTML copies, repository and publisher copies, syndicated articles, and mirrors of the same edition share one work family when identifiable. Multiple URLs in one work family do not satisfy an independent-corroboration requirement. Contested, priority, and comparison claims normally require passage-backed support from at least two independent works.

## Admission and ranking

Ranking is staged and explainable:

1. eligibility and policy
2. correct person/entity
3. question relevance
4. original-page passage support
5. publisher and source-type fitness for the claim
6. work-family independence and evidence diversity

A prestigious but irrelevant page is rejected. A general-web host can contain a useful identifiable primary text, but its host remains general web and its provenance must be explicit. Search snippets never become evidence.

## Caching, cost, and security

Normalized search results are cached for 24 hours. Original-source reads are shared briefly within a process so one request does not fetch and parse the same page repeatedly. Google and Brave are not called together by default, and ordinary research is bounded to at most two focused query intents and a small page set.

All existing safe-fetch controls remain mandatory: HTTPS, SSRF and private-address rejection, DNS validation, redirect revalidation, metadata-endpoint blocking, TLS verification, timeouts, response-size limits, and content-type validation. DCF does not bypass paywalls, authentication, robots, or access refusals. Service credentials remain server-only.

## Citation rule

Every live citation must point to an original page DCF actually read and to the passage used. Citation audit data includes URL, title, publisher metadata when available, locator, passage excerpt, evidence type, passage-support level, work-family key, accessibility, and retrieval time. Bibliographic-only discoveries cannot be answer citations.
