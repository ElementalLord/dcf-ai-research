# Tech transfer and DCF site integration: synopsis

*For Shrikant ji and the DCF team. The step-by-step guide is in [`HANDOFF.md`](../HANDOFF.md). This page summarises it and lists the decisions we need to make together.*

## The approach in one line

We **transfer** the existing accounts to DCF rather than rebuilding anything. The database, live site, deployment history and settings stay as they are. Only the AI and search keys are replaced, because they cannot move between accounts.

## What DCF will own

| Item | Today | After handoff |
|---|---|---|
| Source code | GitHub `ElementalLord/dcf-ai-research` | A DCF GitHub organisation |
| Website hosting | Vercel, developer's personal account | A DCF Vercel team (Pro plan recommended) |
| Research database | Supabase, developer's organisation | A DCF Supabase organisation |
| AI (answers, search, embeddings) | Developer's Google Gemini key | A new key in a DCF Google Cloud project |
| Web search (optional) | Developer's Brave key | A new DCF Brave key |
| Admin key for Resources | Held by the developer | Regenerated so only DCF holds it |
| Portable data file | In the repository | Same file. It can be reused without the site |

## Part A: handoff steps

**1. Agree terms (DCF and Naitik).** A short written note covering who owns the code and content (the repository has no licence yet), whether Naitik may show the work in a portfolio, how long Naitik supports it after handoff, and the date billing moves to DCF.

**2. DCF creates accounts** and invites Naitik temporarily:
- a GitHub organisation;
- a Vercel team with a payment method;
- a Supabase organisation, with a payment method and a plan that does not pause inactive projects;
- a Google Cloud project with billing and a budget alert (for Gemini);
- optionally, a Brave Search API plan.

**3. Naitik prepares.** Back up the database, confirm all database migrations are applied, close open branches, and run the readiness check (`npm run handoff:check`). The check confirms that no secrets are in the code and that the live site's security settings are in place.

**4. Naitik transfers, in this order:** GitHub repository, then Vercel project, then Supabase project. Each provider has a built-in "Transfer" option, and the live site keeps running throughout.

**5. DCF replaces the keys.** Add the new Gemini and Brave keys, rotate the Supabase key, and run `npm run admin:setup` to create a new admin key. Put them in Vercel's environment settings and redeploy. Keep all keys in DCF's password manager.

**6. Verify together.** Run the automated checks. Then ask a question on Ask and confirm the answer has citations, and sign in to Resources with the new admin key.

**7. Close out.** Naitik leaves the DCF accounts, deletes their own keys and local copies of secrets, and cancels any billing on a personal card.

**Time needed:** about half a day of joint work once DCF's accounts and payment methods exist. Steps 4 to 6 can be done in one session.

**Running costs DCF should plan for:** Vercel Pro, a paid Supabase plan, Gemini usage and, optionally, Brave. The database enforces per-day and per-month caps on Gemini and Brave use. DCF can change these caps to fit its budget.

## Part B: integrating with the DCF website

We need to decide how visitors reach the tool from the DCF site. There are four options:

| Option | What visitors see | Work needed | Recommendation |
|---|---|---|---|
| **1. Subdomain plus menu link** (e.g. `personalities.<dcf-domain>`) | A DCF address and a link from the DCF site's menu | Add the domain in Vercel and one DNS record on DCF's domain. No code changes | **Recommended first step.** Fast, low risk, and every feature keeps working. |
| **2. Path on the main site** (e.g. `<dcf-domain>/personalities`) | Looks like part of the main site | DCF's host must forward that path to Vercel, and the app needs a small configuration change | Possible if DCF's hosting supports it. Check with the web team. |
| **3. Embed in a DCF page** (iframe) | The tool inside a DCF page | The site currently blocks embedding for security. We would allow only the DCF domain to embed it | Works for a single Explore or profile widget. Not suited to Ask or Resources. |
| **4. Use the data file directly** | Profiles built natively in DCF's own site (e.g. WordPress) | DCF's web team builds pages from `dcf-phase1-personalities.json` | A good longer-term option. Ask and Resources would still link to the hosted tool. |

Whichever option we choose, we would also:
- match the DCF logo, colours and footer links where needed;
- point "Back to DCF" links to the main site;
- update the page title and social-sharing preview to the final address;
- keep Resources off search engines (already in place) and restricted to people DCF chooses.

## Questions for Shrikant ji

1. Who at DCF will own the GitHub, Vercel, Supabase and Google Cloud accounts, and who will maintain the site day to day?
2. What platform is the DCF website on, and who manages its domain and DNS?
3. Which integration option do you prefer? Is a subdomain acceptable, and what should it be called?
4. Should Ask be public at launch, or only Explore and the profiles at first?
5. Who should have Resources (admin) access?
6. What monthly budget should the AI and search caps be set to?
7. Should the code repository stay public or become private?
8. What support period after handoff would be helpful?

## Suggested next steps

1. A 30 to 45 minute call with Shrikant ji (or whoever he designates) to answer the questions above.
2. DCF sets up the accounts. Naitik then does the transfer and key replacement in one joint session.
3. Set up the chosen integration and test it on desktop and mobile with the final address.
4. Record the result and hand over the operating documents in `docs/phase1/handoff/`.
