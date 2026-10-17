# Vasistha candidate population

Run date: 2026-10-08. The user-provided seed pack is stored as
[`data/vasistha-candidate-claims.json`](../data/vasistha-candidate-claims.json).
Its 127 statements are proposals, not approved biographical facts.

Run `node --env-file=.env.local scripts/populate-vasistha-candidates.mjs` for a
dry run, or add `--apply` to insert. The importer deduplicates against existing
Vasistha claims and candidates, reuses existing source records and passages,
fetches original source pages, and creates candidate source records and chunks
where needed. It records the seed ID, source ID, epistemic type, and locator in
each candidate's review note. It never approves sources or claims.

The first import created 108 `pending` candidate claims and 132 source chunks
across 35 fetched pages. The existing review screen includes the `pending`
queue. All 35 sources used by those candidates are linked to Vasistha through
`source_personalities`, so they appear in Resources when Vasistha is selected.
As of 2026-10-10, 18 more candidate statements have been promoted to
source-linked claims awaiting review. Vasistha now has 23 claims and 35 linked
sources, including 10 approved source records. No Vasistha claim has been
approved for the strict Ask evidence policy. Reviewers still need to verify
each assertion against its attached passage, especially synthetic
cross-source interpretations and historical inferences. A source URL and a
locator do not by themselves verify a claim.

Nineteen proposals remain in the seed file for follow-up:

- `VAS-028`–`030`, `VAS-087`–`088`, `VAS-126`: Oxford source `S19` could not be fetched.
- `VAS-031`, `VAS-090`: Oxford source `S21` could not be fetched.
- `VAS-091`–`094`, `VAS-123`: Oxford source `S22` could not be fetched.
- `VAS-099`–`103`: Oxford source `S25` could not be fetched.
- `VAS-109`: the supplied institutional URL points to one hymn, while this
  proposal summarizes the full mandala without a single hymn locator.

For several Sanskrit Documents URLs that returned HTTP 406 to the importer, the
corresponding Valmiki Ramayana page was fetched from valmikiramayan.net; the
original seed source ID remains in the review note. The Rigveda institutional
index was resolved to individual hymn pages where the locator identified a hymn.
