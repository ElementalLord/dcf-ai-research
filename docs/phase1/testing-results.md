# Phase 1 testing results and project constraints

Date of testing: 2026-11-14. Code tested: `main` at commit `3a707b2` (merge of the data-completeness, role-lens and AI-setting work).

This document records what was tested, how, and what was **not** tested. It answers the seven questions in the Project Scope and Boundaries document's testing plan, and lists the project's known constraints. Where a result comes from an automated check, it says so; nothing here is marked as verified unless it was run.

## How the testing was done

| Method | What it covered | Run by |
|---|---|---|
| Automated test suite (`npm run test:run`) | 600 tests passed, 20 skipped (the skipped ones need a live database or live provider keys). | Claude Code |
| Production build (`npm run build`) | Succeeds with no database credentials and generates all 25 profile pages. | Claude Code |
| Route check (`node scripts/verify-phase1-demo.mjs`) | Home, Explore and all 25 profile pages return 200 and contain the expected text: 27 pages. | Claude Code |
| Browser check (`node scripts/qa-phase1-browser.mjs`) | 44 checks in a real Chromium browser: 22 at a desktop size (1280×900) and 22 on an emulated iPhone 13. 0 failures. | Claude Code |
| Database trigger test | The AI-additions guard was tested against a scratch Postgres database (12 cases), then the migration was applied to the project's Supabase database and its triggers confirmed present. | Claude Code |
| Live site check | The project owner opened the deployed site and reported that it works. No details were recorded. | Project owner |

**All automated checks above ran against a local production build of the merged code, not the live Vercel site**, because the test environment cannot reach `vercel.app` addresses. To run the same browser checks against the live site:

```bash
npm install --no-save playwright && npx playwright install chromium
node scripts/qa-phase1-browser.mjs https://YOUR-PRODUCTION-ORIGIN
node scripts/verify-phase1-demo.mjs https://YOUR-PRODUCTION-ORIGIN
```

## Results against the scope document's testing plan

| Question | Result | Evidence and limits |
|---|---|---|
| Does the profile use only supported information? | **Pass (data level)** | Tests require every statement shown on every profile to be approved and to cite at least one approved source. The curation script refuses any claim that is not approved or fails the sourcing rule. Contested claims need two independent sources, and 161 that did not were held back. Not re-checked here: whether each source passage really says what the claim says. That is the Mentor's review, recorded as approved. |
| Do the displayed sources match the information in the profile? | **Partly verified** | Every citation resolves to a source record with an original link (checked on Tagore's page; the source panel shows the link). The tests check the structure of the link between claim and source for all 25 profiles. A person has not re-read each source against its claim. |
| Does changing the lens change the focus without changing the facts? | **Pass** | A test applies every lens of every person (71 lenses) and confirms the same set of facts appears; the browser check confirms the section order changes and the facts do not. At least 20 of the 25 people get a different section order under at least one of their lenses. |
| Does the system clearly handle missing or conflicting information? | **Pass** | 27 sections with no approved evidence show a "Limited information" note (19 contested, 3 qualities, 3 challenges, 2 relevance); of the 19 empty contested sections, 16 state how many claims were held back and 3 say none are recorded; the Rishi and Ruler views mark undocumented parameters. A test requires every section to have either approved claims or an explanation. |
| Can users search and browse without confusion? | **Functional pass, not user-tested** | Search by name, partial name and place, an empty-search message, category, role, era and region filters (combined), and the timeline all work in the browser check. No real users were observed. |
| Does the website work on both desktop and mobile screens? | **Pass in emulation** | 22 checks at 1280×900 and 22 on an emulated iPhone 13: no horizontal overflow on Home, Explore or any profile tested, and lens, citation, related-person and filter controls all worked. **Not tested:** a physical phone, Safari or Firefox, or tablet hardware. |
| Are headings, buttons, links and text easy to read and use? | **Partly checked** | Screenshots at desktop and phone width were reviewed by eye; keyboard focus moves through the page; the lens and filter controls are real buttons and menus. **Not done:** a formal accessibility audit (colour contrast measurement, screen-reader test). |

## Pages and profiles exercised in the browser check

- One profile from each of the five presentation categories, at both sizes: Vasistha (Sages), Guru Nanak (Spiritual teachers and reformers), Srinivasa Ramanujan (Scientists and institution builders), Ashoka (Rulers and freedom fighters) and Rabindranath Tagore (Cultural figures). Each showed era, region and at least five sections.
- Lens switching and the shareable `?lens=educator` link on Tagore's page.
- Ruler parameters on Ashoka (all 9) and Rishi parameters on Yajnavalkya (all 10).
- All 25 profile pages for the route check, which confirms they load; the browser check looked at the five above in detail.

## Manual checklist from `handoff/deployment.md`

| Item | Local build, desktop | Local build, mobile (emulated) | Live site |
|---|---|---|---|
| Home and Explore load; five categories and 25 people discoverable | Pass | Pass | Owner: works |
| Search and combined filters; clear empty states | Pass | Pass | Not recorded |
| One profile from each category opens and is readable | Pass | Pass | Not recorded |
| Lens switching changes the focus | Pass | Pass | Not recorded |
| Citation opens source details and original links | Pass | Pass | Not recorded |
| A related-person link opens the expected profile | Pass | Pass | Not recorded |
| Navigation, focus and layout without overflow or breakage | Pass | Pass | Not recorded |

**To complete the live column**, run the two commands above against the production address and fill in:

- Production URL: ______________________
- Deployed commit: ______________________ (the merge commit is `3a707b2`; check Vercel shows the same)
- Tester and date: ______________________
- Devices and browsers used: ______________________
- Issues found: ______________________

## Issues found and fixed during testing

1. **Most claims in 18 profiles were filed under "Disputed or uncertain."** The database labels any unclassified claim "uncertain", although 444 of those 663 claims are rated high certainty. The site now goes by the certainty rating. Fixed; covered by a test.
2. **Misplaced and empty profile sections.** Family background under "Qualities", Operation Flood statistics under "Qualities", and Ashoka's Kalinga war not shown anywhere. Corrected from approved claims already in the dataset; covered by tests.
3. **The production build failed without database credentials.** The database client is now created on first use.
4. **Phone layout widened by long role names in the Explore filters.** Fixed; confirmed no overflow at 390 px.
5. **A rishi-framework mismatch for Adi Shankaracharya**, who is an acharya rather than a Vedic seer. Mapped to the nearest parameters with an explicit note.

Two failures during the final checks were faults in the test itself, not in the site: one check read a page heading before a client-side page change finished, and one phone-width overflow came from a stale local test server. Both were confirmed by re-running against a fresh build.

## Known constraints

- **Contested sections are mostly empty.** Most contested claims lack a second independent source; they stay held back until researchers find one. This is a research task, not a software one.
- **The brief asks every profile to fill every field.** 27 sections show "Limited information" instead. The scope document allows this; the Mentor should confirm they accept it.
- **Era and region live in `data/phase1-curation.json`**, not in the database's own era and region columns.
- **Lenses reorder and highlight approved claims.** They do not generate an AI-written explanation for each role.
- **AI additions:** the website setting "AI can add sources and facts" controls whether AI may record sources or publish facts without review. At the time of writing, the live database had it switched **on**. Turn it off in Resources › Knowledge engine unless the Mentor has approved it. See [known limitations](handoff/known-limitations.md).
- **Ask, live research and the Resources tools** are prototypes beyond the Phase 1 scope and were not part of this test pass.
- **No testing on real devices or other browsers, and no accessibility audit,** as described above.
