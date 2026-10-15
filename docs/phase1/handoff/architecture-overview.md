# Architecture overview

DCF separates knowledge from presentation. The central design rule is: **code remains generic; personality-specific knowledge belongs in data**. The website should not contain hand-written factual biographies that bypass the evidence and review system.

## A. Knowledge asset

The live research database contains related records rather than one long biography:

- **personalities and aliases** establish identity;
- **categories and frameworks** define the research questions and qualities appropriate to each kind of person;
- **sources** record provenance, authority, access, edition, and publication details;
- **passages** preserve usable source material with locators and context;
- **claims** express atomic propositions and carry certainty, epistemic type, framework placement, and review state;
- **claim-source links and reviews** preserve supporting evidence and the decision history;
- **lenses** provide relevant ways to explore a profile without changing its facts.

The approved five-category public presentation is stored separately from the more detailed research taxonomy. That keeps a clear public structure without discarding specialist categories or secondary memberships.

## B. Application and data layer

Supabase is the operational research store. Server-side modules access privileged database functions and keep service credentials out of browsers. Additive SQL migrations under `supabase/migrations/` describe database evolution.

The read-only exporter at [`scripts/export-phase1-personalities.mjs`](../../../scripts/export-phase1-personalities.mjs) reads the live database, applies deterministic selection and sourcing rules, and writes [`data/exports/dcf-phase1-personalities.json`](../../../data/exports/dcf-phase1-personalities.json). The export is application-independent and can be consumed by a future website, mobile application, archive, or analysis tool without React, Next.js, or a live Supabase connection.

The export contains identities, categories, presentation mapping, readable profile sections, lenses, source metadata, citations, review summaries, framework metadata, and a claim-level evidence register. Operational material remains internal to the research system, including administrator credentials and sessions, provider secrets, live-research caches, job checkpoints, raw retrieval indexes/chunks, temporary candidate queues, and application logs.

See the [dataset schema](../dataset-schema.md) for the field-level contract.

## C. Public demo

The public demo reads the portable export and provides:

- category browsing and personality discovery;
- name and alias search plus reliable filters;
- static structured profile routes;
- relevant lens selection;
- citation markers and expandable source details;
- deterministic related-personality suggestions.

The home, Explore, and profile experience is the Track 2 deliverable. The Resources area is an internal research/editorial interface built over the same knowledge system.

## D. Optional AI and research layer

The repository also contains prototype infrastructure beyond formal Phase 1 scope:

- conversational Ask;
- local lexical and vector evidence retrieval;
- Gemini-assisted synthesis and reranking;
- controlled live research and source-access policies;
- source-authority classification and citation validation;
- claim epistemic contracts and classification;
- corpus readiness and evidence-completion tools;
- evaluation suites, quality testing, and human-review experiments.

These capabilities can help researchers discover, organize, and draft material, but they do not confer authority or publication eligibility. Open-ended Q&A and live research should be treated as Phase 2/prototype functionality.

## Publication flow

Research moves from source discovery to registered sources, ingested passages, atomic claims, human review, Mentor approval, deterministic export, and finally the public profile. Review state and provenance travel with the material. A successful AI response, source fetch, or export run never substitutes for human judgment.
