# DCF strict release candidate — 2026-10-20

## Exact delta

Production Vercel deployment `8AVrYH2LtvSaFrwq3QhvBCVD41w6` runs Git commit
`feaa9926dcab12b7fc27ce9917fbbdab24203980` from `main`. The local release
branch descends from that commit. The linked production Supabase project is
`uzmqgduepieacvgocwca`; its migration history ends at
`20261017010000_response_feedback.sql`.

The six pending migrations, in order, are:

1. `20261018010000_demand_research_needs.sql`
2. `20261018020000_demand_verified_admission.sql`
3. `20261018030000_demand_budget_and_activity.sql`
4. `20261019010000_strict_demand_admission_dedup.sql`
5. `20261019020000_corpus_evidence_review_origin.sql`
6. `20261020010000_guarded_reviewed_corpus_transition.sql`

Production has 1,585 claims, 473 sources, 2,854 source chunks, 1,728
claim-source links, 1,679 claim-chunk links, and 25 personalities. The public
claim and source records matched the independent restored copy by ID and
content. The sixth migration guards those baseline checksums and counts, saves
original rows in `corpus_verification_audit`, applies the already completed 319
review decisions, holds 94 claims, leaves 271 reviewed claims eligible, clears
answer caches, and pauses demand research and automatic admission in the
database. It does not delete original claims, sources, users, or auth records.

Production Vercel has the required Supabase service-role, Brave, Gemini, and
admin environment variable names in Production and Preview. Secret values
were not displayed or copied. These five release controls are absent from
Production and must be added for the next deployment:

```text
EVIDENCE_POLICY_MODE=strict
DEMAND_RESEARCH_ENABLED=false
DEMAND_VERIFICATION_SHADOW_ENABLED=false
DEMAND_AUTO_ADMISSION_ENABLED=false
DEMAND_TELEMETRY_ENABLED=false
```

The code also defaults to strict policy and demand flags off. The database
pause provides an independent guard. Budget defaults are $0.05 per request,
$2 per day, $25 per month, eight paid calls, and four concurrent jobs; these
are application estimates, not provider spending caps.

## Validation

The six migrations passed with normal triggers and foreign keys on a restored
copy inside a transaction, followed by `ROLLBACK`. Counts returned to 1,585
claims and 473 sources with no demand tables. A second rehearsal committed all
six migrations on the disposable restore, ran
`scripts/rollback-reviewed-corpus.sql`, and restored 1,585 claims, 473 sources,
1,728 claim-source links, and 1,679 claim-chunk links. No production write was
made. The isolated local database's strict answer eligibility count is 271;
there are no remaining synthetic test people. Focused tests passed (68/68),
lint passed, typecheck passed, and the production build passed with paid
research disabled. The local integration tests covered admission, Ask reuse,
citations, held and unreviewed exclusion, budget, deduplication, transaction
rollback, and source-rights rejection using controlled provider fixtures.

The previously authorized one-call Brave live test did **not** reach passage
verification or admission: one Brave request, three original-page fetches,
zero Gemini calls, and zero claims admitted. The second Ask abstained. This is
why automatic research and admission stay paused in this release. The recorded
budget charge was a $0.01 application estimate, not a confirmed provider bill.

## Deployment after explicit authorization

1. Create and verify a fresh encrypted pre-transition backup with its key held
   separately. Include managed auth/storage data using the project's backup
   facility; `supabase db dump` alone omits managed schemas. Retain the existing
   verified backup and the new backup independently.
2. Set the five Vercel Production environment variables above for the next
   deployment. Confirm the existing secret variable names remain present,
   server-only, and correctly scoped.
3. From the exact release commit, run:

   ```sh
   supabase migration list --linked
   supabase db push --linked --dry-run
   supabase db push --linked
   supabase migration list --linked
   ```

   The guarded corpus migration aborts if production claims or sources have
   changed from the checked baseline. Do not bypass its guard; regenerate and
   rehearse the migration against a fresh restored backup if it fires.
4. In a clean checkout, fast-forward `main` to the release commit and push it:

   ```sh
   git fetch origin
   git switch main
   git pull --ff-only origin main
   git merge --ff-only RELEASE_COMMIT_SHA
   git push origin main
   ```

   Vercel's Git integration deploys pushes to `main`. Confirm the production
   deployment commit, strict policy, paused budget row, and local-only Ask
   citations before considering any separate demand rollout.

## Rollback

Leave all demand flags off and keep the database policy paused. Roll back the
application to production deployment `8AVrYH2LtvSaFrwq3QhvBCVD41w6`:

```sh
npx vercel rollback 8AVrYH2LtvSaFrwq3QhvBCVD41w6
```

If the corpus data transition itself must be undone, run the tested
`scripts/rollback-reviewed-corpus.sql` against the linked production database
with `psql -X -v ON_ERROR_STOP=1 -f scripts/rollback-reviewed-corpus.sql` using
an authenticated production connection. The script aborts if original or
current row counts differ, restores original claim and passage state, clears
caches, and preserves the demand audit tables. Managed auth/storage and new
user records are not deleted. Database migration history remains recorded;
the additive demand schema remains installed but paused.
