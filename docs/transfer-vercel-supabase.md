# Moving Vercel and Supabase to DCF, step by step

This is the detailed companion to [`HANDOFF.md`](../HANDOFF.md). It covers the two parts that need the most care: the **Vercel project** (hosting) and the **Supabase project** (database and photo storage).

**The short version:** both services have a **Transfer** button that moves the existing project into another account. The site address, the data and the settings all stay the same, and the site keeps running. Use the button (Plan A). The database copy route (Plan B) is only a fallback, for when Supabase refuses a transfer or DCF wants the database in a different region.

> **The dialogs come first.** Both providers change their screens from time to time. If a menu name here doesn't match, or the Transfer dialog shows a requirement not listed here, follow the dialog. It always lists whatever is currently blocking the transfer.

## Who does what, in order

The **developer** is the current owner, and **DCF** is whoever at DCF will own the accounts. Each step leaves the live site working.

| # | Who | Step | Time |
|---|---|---|---|
| 0 | Developer | Back up the database (below) | 10 min |
| 1 | DCF | Create the GitHub organization, Vercel team and Supabase organization, add billing, and invite the developer | 30 min |
| 2 | Developer | Transfer the GitHub repository (see `HANDOFF.md` step 1) | 5 min |
| 3 | Both | Transfer the Vercel project (Part 1) | 15 min |
| 4 | Both | Transfer the Supabase project (Part 2, Plan A) | 15 min |
| 5 | DCF | Replace the API keys and admin key (`HANDOFF.md` step 4), then redeploy | 30 min |
| 6 | Both | Check everything works (Part 3), then the developer leaves the DCF accounts | 15 min |

---

## Step 0: Back up the database first

Take a backup before either transfer, even though transfers don't touch the data. DCF should keep the backup.

1. Install the PostgreSQL command-line tools, **version 17 or newer**, so they are at least as new as the live database. macOS: `brew install libpq && brew link --force libpq`. Windows: the PostgreSQL installer, with "Command Line Tools" only. Linux: the `postgresql-client-17` package.
2. In Supabase, open the project and click **Connect** at the top. Choose **Session pooler**, then copy the connection string and replace `[YOUR-PASSWORD]` with the database password. If you don't know the password, reset it under **Project Settings → Database**. The site doesn't use it, so resetting it is safe.
3. Run:

   ```bash
   npm run db:backup -- "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
   ```

   This writes a `supabase-backup-<date>/` folder in the project folder, containing `schema.sql`, `data.sql` and `row-counts.txt`. Git ignores the folder. It holds all the project data, so store it somewhere private that DCF controls, such as a DCF Google Drive. Don't commit it.

> **Why this matters:** the files in `supabase/migrations/` record changes made over time, but the first tables (`personalities`, `sources`, `claims`, `categories`, `parameters`) were created before the migrations began. Running the migrations on an empty database therefore can't rebuild the site. A backup like this one is the only full copy.

---

## Part 1: Vercel

### What moves and what doesn't

| Moves with the project | Doesn't move or needs action |
|---|---|
| All deployments and their history | Analytics/Speed Insights history, if enabled, may not carry over |
| Environment variables (including Sensitive ones) | Marketplace integrations. This project uses none; Supabase is connected through plain environment variables |
| The `dcf-ai-research.vercel.app` address and any custom domains | Billing. The developer's personal plan stops covering the project, and DCF's team plan takes over |
| Git connection settings and build settings | Personal access tokens or CLI links on the developer's laptop. Delete them |

### 1.1 DCF prepares a team

1. Sign up or log in at vercel.com with a DCF email address, then **Create Team**. Choose **Pro**: Hobby is for personal, non-commercial use, and a project can't be transferred into a Hobby account.
2. **Team Settings → Billing**: add DCF's card.
3. **Team Settings → Members → Invite**: invite the developer's Vercel email address as **Owner** for now. Ownership is only needed during the transfer and is removed in Part 3.
4. **Team Settings → Git** (or when prompted later): install the **Vercel GitHub app** on DCF's GitHub organization, with access to the `dcf-ai-research` repository. Without it, pushes to `main` stop deploying.

### 1.2 The developer transfers the project

1. Accept the team invite.
2. Open the project → **Settings → General**, then scroll down to **Transfer Project**.
3. Pick the DCF team and confirm. The dialog lists anything that has to happen first. For this project it should be empty.
4. The transfer usually takes under a minute. The site stays up throughout, at the same address.

### 1.3 DCF reconnects Git and confirms

1. In the DCF team, open the project → **Settings → Git**. It should show the repository at its new GitHub location (`<dcf-org>/dcf-ai-research`). If it shows "disconnected" or the old owner, click **Disconnect**, then **Connect Git Repository** and pick the repository in the DCF organization.
2. **Settings → Environment Variables**: confirm all variables arrived. They're listed in [`.env.example`](../.env.example). At minimum you should see `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `CORPUS_ADMIN_TOKEN_HASH` and `ADMIN_SESSION_SECRET`.
3. **Deployments → latest → ⋯ → Redeploy**. Wait for it to finish, then open the site.
4. Push a tiny commit to `main` (for example, a typo fix in this file) and check that Vercel builds it automatically.

> **Pro plan gotcha:** if the repository is private, Vercel only deploys commits whose author is a member of the team. Anyone who pushes to `main` needs a seat on the DCF Vercel team. Otherwise their deployments show as *blocked*.

### 1.4 Custom domain (optional)

To serve the site at a DCF address such as `personalities.dcf.org`:

1. Project → **Settings → Domains → Add**, then enter the domain.
2. Vercel shows one DNS record to add, usually a `CNAME` to `cname.vercel-dns.com` for a subdomain. Whoever manages DCF's DNS adds it. HTTPS is set up automatically.
3. Nothing in the code needs to change. Link previews use the production domain Vercel reports (`src/lib/site-url.ts`), and Vercel updates that once a custom domain is the primary one. Redeploy once after adding the domain.

---

## Part 2: Supabase

### Plan A: transfer the project (recommended)

The project keeps its address (`https://<ref>.supabase.co`), its keys, its data and its photo storage. **No code or Vercel settings change**, and the site stays up.

#### What can block a Supabase transfer

The transfer dialog checks these. Fix them before you start:

| Blocker | How to clear it |
|---|---|
| You aren't an **Owner** in both organizations | DCF invites the developer as Owner (2.1) |
| The DCF organization is on the **Free plan** and already has 2 active free projects | Upgrade DCF's organization to Pro, which is recommended anyway (see below) |
| A **GitHub integration** or **Vercel integration** is connected to the project | Project → **Settings → Integrations** → disconnect. This project shouldn't have either: its keys were added to Vercel by hand |
| **Branching** is enabled | Disable it under **Branches** (not used here) |
| **Log drains** or **project-scoped member roles** exist | Remove them (not used here) |

> **Pick Pro for DCF.** Free projects **pause after about a week with no activity**, and a paused project takes the site's Ask feature down until someone restores it. Pro projects never pause and get daily backups.

#### 2.1 DCF prepares an organization

1. Sign up at supabase.com with a DCF email address → **New organization**, then choose **Pro**.
2. **Organization → Billing**: add DCF's card.
3. **Organization → Team → Invite**: invite the developer's Supabase email address as **Owner**.

#### 2.2 The developer transfers the project

1. Accept the invite. Both organizations then appear in the organization switcher.
2. Open the project → **Project Settings → General**, then scroll to **Transfer project**.
3. Choose the DCF organization. Read the summary: it shows the plan change and any blockers from the table above. Then confirm.
4. Usage up to that moment is billed to the developer's organization, and usage after it to DCF's.

#### 2.3 DCF confirms

1. The project now appears in the DCF organization, with the same URL.
2. Open the live site and ask a question on `/ai` to confirm it still answers.
3. Rotate the secret key, following `HANDOFF.md` step 4:
   1. Create a new secret key, or roll `service_role`, under **Project Settings → API Keys**.
   2. Put it in Vercel's `SUPABASE_SERVICE_ROLE_KEY` and redeploy.
   3. Confirm the site works, and only then revoke the old key.

That's all for Plan A. Skip to Part 3.

---

### Plan B: copy into a new DCF project (fallback)

Use this only if the transfer is blocked and can't be unblocked, or if DCF wants the database in a different region. The site's address changes to the new project's, so this involves a short maintenance window: anything written to the old project after the backup is lost.

**Settings that live outside the database aren't copied.** These include compute size, network restrictions, custom Supabase domains and API settings, and they need setting again by hand. This site uses the defaults for all of them.

1. **Create the new project.** In DCF's Supabase organization, click **New project**. Choose the same region as the old one, unless moving region is the point. Save the database password in DCF's password manager.
2. **Get both connection strings.** For each project, open **Connect → Session pooler** and copy the string, filling in that project's password. Use the PostgreSQL 17+ tools from Step 0.
3. **Back up the old project:**

   ```bash
   npm run db:backup -- "<OLD session pooler URL>"
   ```

4. **Restore into the new project.** The script refuses to run if the new project already has tables, and afterwards it compares the row count of every table with the backup:

   ```bash
   npm run db:restore -- "<NEW session pooler URL>" supabase-backup-<date>
   ```

5. **Copy the photos.** Photos uploaded through Resources → People live in Supabase Storage, which isn't part of the database dump. Each key is passed for this one command only. They come from **Project Settings → API Keys → secret key** in each project:

   ```bash
   OLD_SUPABASE_URL=https://<old-ref>.supabase.co OLD_SUPABASE_SECRET_KEY=<old secret> \
   NEW_SUPABASE_URL=https://<new-ref>.supabase.co NEW_SUPABASE_SECRET_KEY=<new secret> \
   npm run storage:copy
   ```

   It's safe to run again: files that were already copied are skipped.
6. **Point photo links at the new project.** The database stores full photo addresses, so these still name the old project. In the **new** project's **SQL Editor**, first find every place the old address appears. Replace `OLDREF` with the old project's reference, which is the part before `.supabase.co`:

   ```sql
   select * from (
     select table_name, column_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I where %I::text like %L',
         table_schema, table_name, column_name, '%OLDREF.supabase.co%'), false, true, '')))[1]::text::int as matching_rows
     from information_schema.columns
     where table_schema = 'public' and data_type in ('text', 'jsonb', 'json', 'character varying')
   ) found where matching_rows > 0;
   ```

   Then rewrite them. Photos are normally only in `personalities.explore_profile`. Write a similar `update` for any other column the query lists:

   ```sql
   update public.personalities
   set explore_profile = replace(explore_profile::text, 'https://OLDREF.supabase.co', 'https://NEWREF.supabase.co')::jsonb
   where explore_profile::text like '%OLDREF.supabase.co%';
   ```

7. **Switch the site over.** In Vercel → **Settings → Environment Variables**, set `NEXT_PUBLIC_SUPABASE_URL` to the new project URL and `SUPABASE_SERVICE_ROLE_KEY` to the new project's secret key. Then **Redeploy**.
8. **Check, then retire the old project.** Run Part 3. Keep the old project, or at least its backup folder, for a couple of weeks before deleting it.

These two scripts were tested against a local PostgreSQL database built to resemble the live one. The tests covered pgvector columns, row-level security and its policies, grants, triggers, sequences and the two archive schemas, and a fake storage server with more than 1,000 files and nested folders. They have not yet been run against a real Supabase project, so do Plan B with the old project still running, and switch Vercel over only after the row counts match.

---

## Part 3: Final checks

From a machine with DCF's `.env.local`:

```bash
npm run handoff:check -- https://<site address>
```

```bash
node scripts/verify-phase1-demo.mjs https://<site address>
```

Then by hand:

- [ ] The home page and a few profiles load, with their photos.
- [ ] Asking a question on `/ai` gives a cited answer. This exercises Supabase and Gemini.
- [ ] Signing in on `/resources` works with DCF's new admin key.
- [ ] Sharing the site link in iMessage or WhatsApp shows the DCF preview card.
- [ ] A push to `main` deploys automatically.

When all of that passes:

- [ ] DCF removes the developer from the Vercel team, the Supabase organization and the GitHub organization.
- [ ] The developer deletes their personal Gemini and Brave keys, any local `.env.local`, `.admin-access-key` and backup folders, and cancels any personal billing still attached.
