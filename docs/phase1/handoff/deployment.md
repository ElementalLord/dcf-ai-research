# Deployment and post-deployment smoke test

## Current hosting assumption

This is a Next.js 16 application using the Node.js production runtime (`npm run build`, then `npm run start`). The repository does not identify a hosting vendor or include a linked hosting-project file, deployment workflow, or Git remote. Use DCF's already selected hosting provider; do not select or migrate to a new platform as part of Phase 1 closeout.

The public Explore/profile pages are generated from the checked-in portable JSON. Database-backed APIs, Resources, Ask, and research tools additionally depend on Supabase and, where enabled, external providers.

## USER ACTION REQUIRED

1. Connect this repository to the selected deployment provider.
2. Configure the required environment variables from `.env.example`; enter names and secret values only in the provider's protected settings.
3. Deploy the current branch and final closeout commit.
4. Open the production URL and confirm the expected commit is live.
5. Complete the desktop and mobile smoke tests below.

## Configuration

Build command:

```bash
npm run build
```

For a provider that asks for a start command:

```bash
npm run start
```

Environment variable names are listed in [How to run](how-to-run.md) and `.env.example`. At minimum, configure the Supabase URL and server-only service role for database-backed routes. Configure Gemini, Brave, and synthesis options only for the optional capabilities being enabled. Configure `CORPUS_ADMIN_TOKEN_HASH` and `ADMIN_SESSION_SECRET` before exposing Resources or administrative routes.

Never place `SUPABASE_SERVICE_ROLE_KEY`, provider API keys, admin hashes, or session secrets in browser code or under a `NEXT_PUBLIC_` name.

## Production verification

After deployment, run the non-visual route check against the live origin:

```bash
node scripts/verify-phase1-demo.mjs https://YOUR-PRODUCTION-ORIGIN
```

Then complete this manual check. Test at least one profile from each of the five Phase 1 presentation categories.

### Desktop — a few minutes

- [ ] Home and Explore load; all five categories and 25 personalities are discoverable.
- [ ] Search and combined filters return sensible results and clear empty states.
- [ ] One profile from each category opens and remains readable.
- [ ] Lens switching changes the focus presentation.
- [ ] Citation markers open the correct source details and original links where available.
- [ ] A related-personality link opens the expected profile.
- [ ] Navigation, focus states, and page layout have no obvious overflow or breakage.

### Mobile — a few minutes

- [ ] Navigation, search, and category browsing are usable at a phone width.
- [ ] A profile remains readable and lens controls are usable.
- [ ] Citation/source details open and remain readable.
- [ ] Related-personality links are usable.
- [ ] There is no horizontal page overflow or clipped essential content.

Record the production URL, deployed commit, tester, date, devices/viewports, and any issue found. Mark the deployment and visual-QA rows in the [final acceptance checklist](../FINAL-ACCEPTANCE-CHECKLIST.md) `PASS` only after these steps succeed.
