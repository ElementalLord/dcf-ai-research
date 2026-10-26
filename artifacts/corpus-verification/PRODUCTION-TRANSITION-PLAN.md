# Production transition and rollback plan (draft; no production action authorized)

## Gate before any transition

1. Complete evidence assessment for all 1,585 original IDs and reconcile the ledger against a fresh read-only export. Require exactly one final disposition per original ID and zero pending decisions.
2. Repair source links where a stored document URL points to an index or unrelated page. Recheck each retained claim's final wording against an actual source passage, epistemic contract, provenance record, and any required independent corroboration.
3. On an isolated clone of the then-current production snapshot, apply the final ledger in one guarded transaction. Confirm only approved/revised claims are eligible under strict policy; removed originals remain in internal audit history.
4. Run strict Ask, broad profile, source-passage, cache, legacy-origin exclusion, concurrent admission, rights, budget, and rollback tests. Verify that source chunks shared by a removed duplicate and a retained claim reveal only the supported passage, without retrieving the removed claim record.
5. Review the resulting per-personality counts and exact SQL diff. Obtain separate production authorization before merge, deploy, migration, or feature flag change.

## Authorized migration sequence, once those gates pass

1. Pause automatic admission and capture a fresh encrypted, checksummed production backup and schema/version inventory. Record the rollback point.
2. Deploy reviewed code and migrations for the distinct `corpus_evidence_review` origin and demand admission controls. Keep admission paused until corpus gates pass.
3. In one transaction, create protected audit snapshots, compare each production original ID/text/version with the reviewed ledger, apply final wording and statuses, attach corrected source and passage links, and invalidate answer/profile/research caches. Abort on any mismatch.
4. Query strict retrieval and public Ask/profile paths against representative claims from every personality, every removal, traditional narratives, and known contested facts. Confirm zero unreviewed active claims, accurate citations, and no stale cache entries.
5. Enable demand admission only under separately authorized budget and feature flag settings after its post-deploy tests pass.

## Rollback

- Before commit: abort the transaction; no corpus change should be visible.
- After commit: pause admission immediately, revert the application release, and restore claim/source/status links from the protected audit snapshot or the encrypted pre-transition backup. Keep newly admitted records and decisions in audit history while suspending their public eligibility. Invalidate caches again and re-run strict retrieval checks.
- Preserve the pre-transition backup, manifest, decision ledger, SQL execution receipt, and before/after counts for audit. Do not overwrite the only backup.

The current isolated review copy is a working staging subset. Its local SQL application files are **not** production migration scripts.
