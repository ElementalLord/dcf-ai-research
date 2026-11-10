# Handoff to Dharma Civilization Foundation

The plan is to **transfer** the existing GitHub repository, Vercel project and Supabase project to DCF-owned accounts, not to rebuild them. The database, deployment history, domain and environment settings all stay in place. Only the Gemini and Brave API keys are newly created, because those keys cannot be transferred between accounts.

No passwords, API keys or payment details belong in this file or anywhere in the repository. Exchange secrets only by entering them directly into the provider dashboards.

## What exists today

| Service | Current location | Used for |
|---|---|---|
| GitHub | `ElementalLord/dcf-ai-research` (public) | Source code |
| Vercel | Personal scope `elementallords-projects`, project `dcf-ai-research`; live at https://dcf-ai-research.vercel.app | Hosting. Every push to `main` deploys automatically |
| Supabase | One project, owned by the developer's organization | Database: personalities, sources, claims, caches, rate limits |
| Google Gemini | API key from the developer's Google account | Answer writing, search grounding, embeddings |
| Brave Search | API key from the developer's Brave account | Optional web discovery for research |

## Credentials DCF needs to provide

Enter every value in **Vercel → dcf-ai-research → Settings → Environment Variables** (Production, plus Preview if used), then redeploy. For local development the same names go in `.env.local`; `.env.example` lists them all.

| Variable | Where DCF gets it | Changes at handoff? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | No. The URL stays the same after the transfer |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys (service_role or a new secret key) | Rotate after the transfer |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey), created in a DCF Google Cloud project | Yes, a new DCF key |
| `BRAVE_SEARCH_API_KEY` | [Brave Search API dashboard](https://api-dashboard.search.brave.com) | Yes, a new DCF key (optional) |
| `CORPUS_ADMIN_TOKEN_HASH`, `ADMIN_SESSION_SECRET` | Run `npm run admin:setup` locally. It prints a new admin key once and writes both values to `.env.local` | Yes, regenerate so only DCF knows the admin key |

Model names and feature switches (`GEMINI_*_MODEL`, `SYNTHESIS_*`, `DEMAND_*`, `EVIDENCE_POLICY_MODE`) are also environment variables with working defaults. None of them need to change.

## Before you start

1. **Agree ownership in writing.** The repository has no LICENSE file. A short note between the developer and DCF should say who owns the code and content, whether the developer may show it in a portfolio, how long (if at all) the developer supports it after handoff, and the date billing moves to DCF.
2. **Back up the database.** Take a Supabase backup (or `pg_dump`) before clicking Transfer, and keep it somewhere DCF controls.
3. **Apply every migration.** The newest file in `supabase/migrations/` must already be applied to the live project, including `20261110030000_harden_function_privileges.sql`. Tell DCF the live database is current so nobody re-runs old files.
4. **Close open work.** Merge or close open pull requests and delete finished branches so DCF starts from a clean `main`.
5. **Run the readiness check** from a machine with `.env.local`:

   ```bash
   npm run handoff:check -- https://dcf-ai-research.vercel.app
   ```

   It never prints secret values. It fails if any secret file or key is in git history, a required variable is missing or malformed, a non-Supabase `NEXT_PUBLIC_` variable exists, the live site lacks the security headers, or the admin API answers anonymous calls. It warns about leftover branches and about personal commit emails, which stay visible after the transfer. If those emails matter, make the repository private rather than rewriting history.

## Transfer steps

Do the steps in this order. Each one keeps the live site running.

### 1. GitHub repository

1. **DCF:** Create (or choose) a GitHub organization. Make the developer a member who is allowed to create repositories.
2. **Developer:** Repository → Settings → General → Danger Zone → **Transfer ownership** → choose the DCF organization. GitHub redirects the old URL automatically.
3. **DCF:** Decide whether the repository should stay public, and add DCF maintainers.

### 2. Vercel project

1. **DCF:** Create a Vercel team (Pro is recommended for organizational use; the Hobby plan is for personal, non-commercial projects). Add a payment method under **Team Settings → Billing**. Invite the developer as a member.
2. **Developer:** Project → Settings → General → **Transfer Project** → select the DCF team. Environment variables, domains and deployments move with the project.
3. **DCF:** Install the Vercel GitHub app on the DCF GitHub organization. Then, under Project → Settings → Git, confirm the project is connected to the transferred repository, and reconnect it if not.
4. **DCF:** Push a small commit (or click **Redeploy**) and confirm that the new deployment goes live.

### 3. Supabase project

1. **DCF:** Create a Supabase organization, pick a plan, and add a payment method under **Organization → Billing**. Invite the developer as an **Owner**, since a transfer requires Owner rights in both organizations.
2. **Developer:** Project → Settings → General → **Transfer project** → select the DCF organization. The project URL, data and keys stay the same, so the site keeps working. The transfer dialog lists any blocking requirements (for example, plan or integration limits).
3. **DCF:** Confirm the project now appears in the DCF organization, then remove the developer's access.

### 4. Replace the API keys and add billing

| Provider | DCF adds payment at | Then |
|---|---|---|
| Vercel | Team Settings → Billing | Covered in step 2 |
| Supabase | Organization → Billing | Covered in step 3 |
| Gemini | Google Cloud Console → Billing. Link a billing account to the Google Cloud project that owns the new key, and set a budget alert | Create a key in AI Studio and put it in `GEMINI_API_KEY` |
| Brave | Brave Search API dashboard → subscribe to a plan and add a card | Create a key and put it in `BRAVE_SEARCH_API_KEY` |

Next, rotate the inherited secrets:

1. **Supabase key:** Create a new secret key, or roll the service_role key. Put it in `SUPABASE_SERVICE_ROLE_KEY`, redeploy, confirm the site works, and only then revoke the old key.
2. **Admin key:** Run `npm run admin:setup`, copy the two values it wrote to `.env.local` into Vercel, redeploy, and keep the printed admin key in DCF's password manager. Existing admin sessions end.
3. **Redeploy** after any change to environment variables, because Vercel only reads them at build and deploy time.

When DCF confirms everything works on its own keys, the developer deletes their old Gemini and Brave keys.

### 5. Verify

```bash
npm run handoff:check -- https://dcf-ai-research.vercel.app
node scripts/verify-phase1-demo.mjs https://dcf-ai-research.vercel.app
```

Then by hand:
- Ask a question on `/ai` and check that the answer has citations. This exercises Supabase and Gemini.
- Sign in on `/resources` with the new admin key.

## Who does what

**Developer**
- [ ] Transfer the GitHub repository, Vercel project and Supabase project (steps 1–3).
- [ ] Hand over any custom domain or DNS records, if one has been added.
- [ ] Leave the DCF organizations after DCF confirms everything works.
- [ ] Revoke personal Gemini and Brave keys and delete the local `.env.local` and `.admin-access-key`.
- [ ] Cancel any subscriptions or billing still on a personal card (Vercel, Supabase, Google Cloud, Brave).

**DCF**
- [ ] Choose a Supabase plan that does not pause inactive projects, or check the project regularly.
- [ ] Create the GitHub org, Vercel team and Supabase org, and invite the developer temporarily.
- [ ] Add payment methods to Vercel, Supabase, Google Cloud (Gemini) and Brave.
- [ ] Create new Gemini and Brave keys, rotate the Supabase key, and regenerate the admin key (step 4).
- [ ] Keep all keys in a password manager, and set spend alerts with Google Cloud and Brave.

## Running and maintaining

**Run locally** (Node.js 22 or newer):

```bash
npm install
cp .env.example .env.local   # then fill in real values
npm run dev                  # http://localhost:3000
```

**Checks before pushing:** `npm run typecheck && npm run lint && npm run test:run && npm run build`

**Deploy:** Merge or push to `main` and Vercel builds automatically. Roll back with Vercel → Deployments → **Promote to Production** on an earlier deployment.

**Database changes:** New SQL files go in `supabase/migrations/`. Apply them in filename order, before deploying code that depends on them. So far they have been run by hand in the Supabase SQL Editor.

**Costs and limits:** The database caps Gemini and Brave usage per second, day and month (see the "Abuse and provider limits" section of `README.md`). Adjust the caps in the `api_rate_policies` table to match DCF's plans.

**More detail:** See `docs/phase1/handoff/` for the architecture, adding personalities, the review workflow and known limitations.
