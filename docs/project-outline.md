# DCF Inspiring Personalities: Project Outline and User Guide

Live site: https://dcf-ai-research.vercel.app. Code: https://github.com/ElementalLord/dcf-ai-research (this will move to a DCF account at handoff).

## 1. About this document

This guide is for whoever looks after DCF Inspiring Personalities after the original developer hands it over. It explains what the application is, the thinking behind it, how it works, and how to use each part of it. It is written for editors and board members first, with a final section for the person who maintains the technical side. More detailed technical documents are listed at the end.

## 2. What the application is

DCF Inspiring Personalities is a website for learning about people from Indian civilization whose lives are still worth studying. It currently holds 25 approved profiles arranged in five groups of five. The groups are Sages and Philosophical Traditions, Spiritual Teachers and Social Reformers, Scientists and Institution Builders, Rulers and Freedom Fighters, and Cultural Figures and Nation Builders.

The 25 people are A. P. J. Abdul Kalam, Adi Shankaracharya, Agastya, Ashoka, Bhagat Singh, C. V. Raman, Chhatrapati Shivaji Maharaj, Guru Nanak, J. R. D. Tata, Jagadish Chandra Bose, Jamsetji Tata, M. S. Subbulakshmi, Rabindranath Tagore, Rajaraja Chola I, Ramakrishna Paramahamsa, Rani Lakshmibai of Jhansi, Satyajit Ray, Savitribai Phule, Srinivasa Ramanujan, Subhas Chandra Bose, Swami Vivekananda, Vasistha, Verghese Kurien, Vishvamitra and Yajnavalkya.

The site has three parts. The public collection (Home, Explore and the profile pages) lets anyone browse and read the profiles. Ask lets a visitor put their own questions about a person and get an answer with sources. Resources is a private, password-protected workspace where DCF editors add people, check sources, approve statements and control the automatic research.

What makes it different from an encyclopedia or a general chatbot is that every statement on a profile is tied to a credible source that the reader can open and check, and nothing is published without a person approving it.

## 3. The thinking behind it

Evidence first. A profile is not one long biography. It is built from many small, separate statements called claims. Each claim says one thing, is linked to the source and the exact passage it comes from, and has a review status (draft, needs review, approved or rejected). The public site shows only approved claims.

AI assists, people decide. AI is used to find sources, read them, suggest claims and write Ask answers. It does not decide what is true and does not publish profile content on its own. A human reviewer approves each claim, and the 25 profiles as a whole were approved by the Mentor.

A framework for each kind of life. A rishi, a ruler and a scientist are studied through different questions. Each research category has its own framework of qualities and fields (for example context, qualities, contributions, challenges, relationships, complexity and present-day relevance). The DCF Rishi and Ruler parameter documents are mapped onto the matching profiles.

Honesty about gaps. When a section has no approved evidence, the profile says so in a short note and does not invent content. Contested or sensitive statements must be supported by at least two independent credible sources, at least one of them primary or scholarly. 161 statements were held back because they did not meet that standard. Holding a statement back means the evidence was not strong enough yet, not that the statement is false.

The knowledge outlives the website. All approved profiles are exported to a single data file (data/exports/dcf-phase1-personalities.json) with a documented format. DCF can reuse it in another website, a mobile app, teaching material or an exhibition without this code.

## 4. How it works

The research database. All research lives in a Supabase (PostgreSQL) database. The main records are personalities and their other names; categories and frameworks; sources (books, texts, archives, articles, with author, publisher, date and how authoritative the publisher is); passages (stored extracts of source text with their location); claims (single statements linked to the passages that support them); and reviews (who decided what, and when). Lenses, such as educator or reformer, are ways of viewing a profile that reorder and highlight the same approved claims without changing them.

The public profiles. The 25 curated profiles are generated from the database by an exporter script, which applies the publication rules and writes the data file. Era, region, introductions, notes on empty sections and the Rishi and Ruler parameter views come from an editorial file (data/phase1-curation.json). The five-group arrangement is in data/phase1-presentation.json. The site builds the Explore and profile pages from these files in advance, so they load quickly and keep working even when the AI services are down. People added later through Resources are published straight from the database instead, and appear on Explore without a rebuild.

How Ask answers a question. When a visitor asks a question, the system works through these stages in order. First it finds the approved claims and passages in its own library that bear on the question, using both keyword search and meaning-based (embedding) search. Second, if the library does not cover the question, it re-reads credible works that earlier questions about the same person had found. Third, if a gap still remains, it asks Google Gemini to search the web and then fetches the original pages itself; it only accepts passages from pages that pass DCF's credibility checks, and search summaries and snippets never count as evidence. Brave Search is used as a second search provider when Google does not find enough. Fourth, it selects a small set of the strongest evidence and asks Gemini to write the answer from that evidence only, with numbered citations. If the AI service is unavailable or a spending limit has been reached, Ask shows the relevant evidence passages directly instead of a written answer. If the evidence is not good enough, it says so rather than guessing.

Knowledge harvest. Every time Ask uses live search, it records the works it read, scores each one for credibility (publisher standing, type of evidence, stated author and publisher, how well the passage supports the question, agreement from other independent works, and track record), and keeps pointers to the useful passages. Later questions check these remembered works before paying for a new search. No visitor question text is stored. Whether AI may add sources and facts to the database by itself is controlled by a switch in Resources that is off by default; when off, harvested works only appear as suggestions for an editor.

Cost and abuse protection. Ask uses paid services (Gemini and, optionally, Brave). The database enforces limits on how often any one visitor can ask (20 questions a minute and 200 a day) and on total calls to each paid service per second, day and month. When a limit is reached, the site returns a "try again later" message or falls back to evidence passages. Answers are cached for 24 hours so the same question does not cost twice.

Hosting. The site is a Next.js web application hosted on Vercel. Every change pushed to the main branch of the code repository is deployed automatically. Secret keys are kept only in Vercel's settings, never in the code.

## 5. Using the public site

Home. The home page introduces the collection and leads to Explore. You can choose one of the five groups or go straight to the full list. A light or dark display can be chosen with the theme switch.

Explore. Explore lists every published person. You can filter by group, role, era and region, search by name or by another name the person is known by, and follow a timeline that places everyone in order. Choosing a person opens their profile.

A profile page. Each profile opens with a short introduction, era and region. It then shows sections such as context, qualities, contributions, challenges, relationships, complexity and relevance today. Sages and rulers also show the DCF Rishi or Ruler parameter view. Numbers in the text are citations: click one to see the source's title, author, publisher and the passage that supports the statement. The "View as" choices apply a lens (for example educator, reformer or scientist) that brings the most relevant statements forward. A lens choice is kept in the page address, so a link you share opens with the same lens. Related lives at the end suggests who to read next. A section with a short note instead of text means there is not yet enough approved evidence for it.

Ask. Open Ask from the menu, or from a profile. Choose a person from the picker (you can filter it by group or type a name). Then type a question or choose one of the suggested questions. Choose how deep the answer should be: Simple is brief and plain, Balanced gives the answer with context, Detailed gives more explanation, and Research gives a fuller review of the evidence. Each answer has numbered citations; click one to see the source and the passage used. After an answer, follow-up options such as "In its time", "Who else?" and the person's lens angles let you continue the conversation. You can rate each answer from one to five stars and leave a comment, which DCF editors see in Resources. Ask is a prototype: treat its answers as a well-sourced starting point and check important points against the cited sources.

## 6. Using Resources (editors and board members)

Signing in. Go to /resources and enter the admin key. The key is created by the technical maintainer (see section 9) and should be kept in DCF's password manager. Signing in lasts 12 hours. Use Sign out at the top when you finish on a shared computer. Every Resources page has a "How to use" button with step-by-step help for that page. Resources is hidden from search engines and every action is checked on the server.

Resources has five sections, shown along the top: People, Sources and claims, Feedback, Knowledge engine, and Extra diagnostics.

People. This is where you add a new person to Explore or edit an existing one. Adding a person takes three steps, and each step is saved so you can stop and come back. Step one: choose Add a person and enter the name, the Explore group, the research category (which decides which research fields claims can use), the era and the region. A Wikipedia article title gives the profile a portrait. Reading angles (lenses) are pre-filled for the group and can be edited or removed. Step two: choose Add sources and claims, which takes you to Sources and claims for that person. Add at least one source and approve it, then add claims that cite it and approve them. Only approved claims with an approved source appear on Explore. Step three: when the checklist on the person's card is complete, choose Publish to Explore. The profile appears on Explore, the home page and Ask straight away, and later approvals show up within five minutes. Unpublish hides the profile again without deleting anything. Edit changes the name, group, era, region, photo or angles. For the 25 curated profiles you can edit the short name, other names, era, place, photo and reading angles; their reviewed text stays as exported.

Sources and claims. This is the main editorial workspace, with three areas: Sources, Claims and Web search. Choose a person at the top first. If "Needs attention" lists anything, start there; each item opens the list already filtered to what needs a decision.

In Sources, open a source to read its details, linked claims and stored passages. Approve it if it is a work that answers may cite, or reject it with your name. Add source creates a candidate that is not used until someone approves it. A source's authority (authoritative, credible secondary or general web) describes the publisher and is separate from how certain any claim is. You can add passages of source text with their location (page, chapter or section).

In Claims, filter to Needs review or Draft, open a claim, read its supporting passage, then approve or reject it with your name and an optional note. Add claim needs the statement, a research field, a source and the exact passage that supports it. Write one statement per claim and keep the wording no stronger than the passage supports. If an approved claim needs changing, return it to review first, edit it, then approve it again. The keys J and K (or the arrow keys) step through a list, slash jumps to search, and Escape closes the open panel.

In Web search, you decide where live research may look when the library is not enough. Choose a search mode: Credible Web (the default, which finds new websites and checks them before use), Approved Sources Only (only websites you have allowed), or Credible Web with your rules. Domain rules let you allow, trust, block or pause whole websites; Recently found lists websites that research discovered, strongest first, for you to allow, block or ignore. Page access permissions control single pages or sections. Allowing a website to be searched does not by itself make its content approved evidence.

Feedback. Every star rating and comment that readers leave under an Ask answer appears here. Start with Low-rated answers (one or two stars). Filter by rating, person, tag, date or whether the answer used live search. Open a response to see the question, the answer, the comment and the sources cited. Fix the cause in Sources and claims: add or approve a source, correct a claim, or change which websites research may read.

Knowledge engine. This shows what live research has done, what it cost and what it harvested, and it holds the spending controls. Under Budget and publication controls you set the ceiling per question, daily and monthly allowances, the most paid calls per question and how many research jobs may run at once; choose Save policy to apply them. The switch "AI can add sources and facts" is off by default. Off means AI may search and suggest, but only reviewed material enters the database. Turn it on only with the Mentor's approval. "Pause new research" stops new live research without changing anything else. Source harvest lists the works that live answers read; you can add one as a candidate source, reject it or restore it. Estimated costs here should be checked against the real bills from Google and Brave.

Extra diagnostics. Detailed tables for troubleshooting that do not need checking day to day. Profile readiness rates each person as Strong, Usable, Thin or Needs attention and says what is missing. The research run log shows the last 30 questions, whether each was answered from the library or by live research, and what it cost. Verification decisions lists every automatic decision with its reason, including statements that were held back. Cooldowns lists topics that recently failed to find enough evidence and will wait before being searched again.

## 7. Rules for publishing

Before a factual statement appears on a profile, it must be supported by a registered, credible source and a traceable passage; its wording must match what the evidence shows; its type (historical fact, what a text says, traditional narrative, scholarly interpretation and so on) must be recorded correctly; a human reviewer must approve it; and contested or sensitive material must meet the two-source standard. A complete new profile should be approved by the Mentor before publication.

Keep these decisions separate. A credible publisher does not make every claim from it true. A traditional or religious text proves what the text says, not that every event it describes happened. Allowing a website to be read is not the same as approving its content. An AI answer, a high confidence score or a successful build never counts as approval. If evidence or wording changes after approval, the claim goes back through review.

The roles are as follows. The researcher gathers sources, records details and drafts claims. The reviewer checks each claim against its evidence and approves, rejects or asks for changes. The Mentor makes final decisions on sensitive inclusions and signs off complete profiles. The technical maintainer makes sure the live site only shows approved material.

## 8. Common tasks

To add a new person, follow the three People steps in section 6. Aim for several approved sources, including primary or scholarly works, and claims covering each field of the person's framework before publishing. The full research procedure is in docs/phase1/handoff/how-to-add-a-personality.md and docs/phase1/content-pipeline-sop.md.

To correct a statement on a profile, find the claim in Sources and claims, return it to review, edit it or reject it, and approve the corrected version. For people added through Resources the change appears within five minutes. For the 25 curated profiles, the technical maintainer must re-run the exporter and redeploy for the change to appear (section 9).

To deal with a poor Ask answer, open it in Feedback, look at which sources it cited, and either add better sources and claims for that person or block an unreliable website in Web search.

To control spending, set the allowances in Knowledge engine, set spending alerts in Google Cloud and Brave, and use Pause new research if costs rise unexpectedly. Ask keeps working from the library while research is paused.

To give someone editing access, share the admin key with them through DCF's password manager. To take access away, ask the technical maintainer to create a new key; everyone is then signed out.

## 9. For the technical maintainer

Where things are. The code is a Next.js application in the GitHub repository. Pages are in src/app (home, explore, ai for Ask, resources, and api for the server endpoints). Shared logic, including retrieval, research and the knowledge harvest, is in src/lib. Database changes are SQL files in supabase/migrations, applied in filename order. Data files are in data, scripts in scripts, tests in tests and documentation in docs.

Services and keys. The application needs these settings, listed in .env.example: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the database, GEMINI_API_KEY for AI, BRAVE_SEARCH_API_KEY for optional search, and CORPUS_ADMIN_TOKEN_HASH and ADMIN_SESSION_SECRET for the admin key. Secret values must never have the NEXT_PUBLIC_ prefix and must never be committed. In production they are set in Vercel under Settings, Environment Variables, followed by a redeploy.

Running it on your computer. Install Node.js 22 or newer. Run npm install, copy .env.example to .env.local and fill in the values, then run npm run dev and open http://localhost:3000. Run npm run admin:setup to create a new admin key; it prints the key once and stores only a hash of it.

Before publishing a change, run npm run typecheck, npm run lint, npm run test:run and npm run build. After deployment, node scripts/verify-phase1-demo.mjs followed by the site address checks the public pages.

Deploying. Merge or push to the main branch and Vercel builds and deploys automatically. To undo a bad release, open the project's Deployments page in Vercel and promote an earlier deployment to production.

Database changes. Add a new SQL file to supabase/migrations with a later date in its name, apply it in the Supabase SQL editor before deploying code that depends on it, and never edit or re-run old files.

Updating the 25 curated profiles. After claims change in the database, run node --env-file=.env.local scripts/export-phase1-personalities.mjs to regenerate the data file, check the changes, run the checks above and deploy. Never edit the generated data file by hand; fix the database or the curation file and regenerate.

Limits. Per-visitor and per-service limits are stored in the api_rate_policies table and can be changed to match DCF's plans and budget. Also set a spending cap and alerts in Google Cloud.

Handover checks. npm run handoff:check followed by the site address confirms that no secrets are in the code, the required settings are present, and the live site's security headers are in place.

## 10. Known limitations

Ask, live research and the knowledge engine are prototypes beyond the original scope and have not been run as a production service with real traffic. 27 profile sections across the 25 people have no approved evidence and show a note instead. About two-thirds of claims still carry a default "uncertain" evidence type that would benefit from proper classification. Some duplicate sources and claims may remain in the research records. The site has been tested on desktop and an emulated phone, but not yet on Safari, Firefox, a physical phone or with a formal accessibility audit. Website links in sources can break over time and may need occasional maintenance.

## 11. Where to find more detail

HANDOFF.md explains how the accounts move to DCF and which keys to replace. README.md gives the full technical description. In docs/phase1/handoff you will find the architecture overview, how to run the project, how to add a personality, human review and governance, known limitations, deployment, and Phase 2 recommendations. docs/phase1/content-pipeline-sop.md is the detailed research procedure. docs/phase1/dataset-schema.md describes the data file. docs/knowledge-harvest.md and docs/live-research-policy.md describe automatic research in depth.
