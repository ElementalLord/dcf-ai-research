# Tech Transfer and DCF Site Integration: Synopsis

For Shrikant ji and the DCF team. The full step-by-step guide is HANDOFF.md in the code repository. This page summarises it and lists the decisions we need to make together.

## Summary

We transfer the existing accounts to DCF rather than rebuilding anything. The database, live site, deployment history and settings stay as they are. Only the AI and search keys are replaced, because they cannot move between accounts. For the DCF website, the recommended first step is a DCF subdomain linked from the main site's menu, which needs no code changes.

## What DCF will own

The source code moves from the GitHub repository ElementalLord/dcf-ai-research to a DCF GitHub organisation.

Website hosting moves from the developer's personal Vercel account to a DCF Vercel team. The Pro plan is recommended for an organisation.

The research database moves from the developer's Supabase organisation to a DCF Supabase organisation.

The AI service (answers, web search and embeddings) currently uses the developer's Google Gemini key. DCF will create a new key in its own Google Cloud project.

Web search, which is optional, currently uses the developer's Brave key. DCF will create its own Brave key if it wants this.

The admin key for the Resources workspace is currently held by the developer. It will be regenerated so that only DCF holds it.

The portable data file of all profiles stays in the repository unchanged and can be reused without the website.

## Part A: Handoff steps

Step 1. Agree terms. DCF and Naitik agree in a short written note who owns the code and content (the repository has no licence yet), whether Naitik may show the work in a portfolio, how long Naitik supports it after handoff, and the date billing moves to DCF.

Step 2. DCF creates its accounts and invites Naitik temporarily. These are a GitHub organisation; a Vercel team with a payment method; a Supabase organisation with a payment method and a plan that does not pause inactive projects; a Google Cloud project with billing and a budget alert for Gemini; and, optionally, a Brave Search API plan.

Step 3. Naitik prepares: backing up the database, confirming that all database changes are applied, closing open branches, and running the readiness check, which confirms that no secrets are in the code and that the live site's security settings are in place.

Step 4. Naitik transfers the GitHub repository, then the Vercel project, then the Supabase project. Each provider has a built-in transfer option, and the live site keeps running throughout.

Step 5. DCF replaces the keys. DCF adds the new Gemini and Brave keys, rotates the Supabase key and creates a new admin key, enters them in Vercel's settings, redeploys, and stores all keys in its password manager.

Step 6. Verify together. We run the automated checks, ask a question on Ask and confirm the answer cites its sources, and sign in to Resources with the new admin key.

Step 7. Close out. Naitik leaves the DCF accounts, deletes their own keys and local copies of secrets, and cancels any billing on a personal card.

Time needed: about half a day of joint work once DCF's accounts and payment methods exist. Steps 4 to 6 can be done in one session.

Running costs DCF should plan for: Vercel Pro, a paid Supabase plan, Gemini usage and, optionally, Brave. The database enforces daily and monthly caps on Gemini and Brave use, and DCF can set these caps to fit its budget.

## Part B: Integrating with the DCF website

We need to decide how visitors reach the tool from the DCF website. There are four options.

Option 1, a subdomain with a menu link. Visitors see a DCF address such as personalities.(DCF domain), linked from the main site's menu. This needs the domain added in Vercel and one DNS record on DCF's domain, and no code changes. This is the recommended first step because it is fast, low risk, and every feature keeps working.

Option 2, a path on the main site. Visitors see an address such as (DCF domain)/personalities, which looks like part of the main site. DCF's web host must forward that path to Vercel, and the application needs a small configuration change. This is possible if DCF's hosting supports it, which the web team can confirm.

Option 3, embedding in a DCF page. The tool appears inside a page of the DCF site. The site currently blocks embedding for security, so we would allow only the DCF domain to embed it. This suits a single Explore or profile section, but not Ask or Resources.

Option 4, using the data file directly. DCF's web team builds profile pages natively in the DCF site (for example in WordPress) from the exported data file. This is a good longer-term option; Ask and Resources would still link to the hosted tool.

Whichever option we choose, we would also match the DCF logo, colours and footer links where needed, point the "Back to DCF" links to the main site, update the page title and social-sharing preview to the final address, and keep Resources hidden from search engines (already in place) and restricted to people DCF chooses.

## Questions for Shrikant ji

1. Who at DCF will own the GitHub, Vercel, Supabase and Google Cloud accounts, and who will maintain the site day to day?

2. What platform is the DCF website on, and who manages its domain and DNS?

3. Which integration option do you prefer? If a subdomain, what should it be called?

4. Should Ask be public at launch, or only Explore and the profiles at first?

5. Who should have Resources (admin) access?

6. What monthly budget should the AI and search caps be set to?

7. Should the code repository stay public or become private?

8. What support period after handoff would be helpful?

## Suggested next steps

First, a 30 to 45 minute call with Shrikant ji, or whoever DCF designates, to answer the questions above. Second, DCF sets up the accounts, and Naitik then does the transfer and key replacement in one joint session. Third, we set up the chosen integration and test it on desktop and mobile at the final address. Fourth, we record the result and hand over the operating documents.
