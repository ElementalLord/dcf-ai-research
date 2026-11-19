# DCF Inspiring Personalities: project outline

*A short introduction for new users. Live site: https://dcf-ai-research.vercel.app*

## What it is

DCF Inspiring Personalities is a website for learning about people from Indian civilization whose lives are still worth studying: sages, spiritual teachers and reformers, scientists and institution builders, rulers and freedom fighters, and artists and nation builders. It holds 25 profiles, five in each of those five groups, from Vasistha and Yajnavalkya to Ramanujan, Savitribai Phule, Subhas Chandra Bose and Satyajit Ray.

Every statement on a profile comes from a credible source, and you can open that source to check it. That is the main difference between this site and a general encyclopedia or chatbot.

## The thinking behind it

1. **Evidence first.** Each profile is made up of small, separate statements ("claims"). Each claim is linked to the book, text or record it comes from, and has a review status. The site shows only approved claims.
2. **People treat AI as a research assistant.** AI helps find sources and draft statements. It does not decide what is true and does not publish profiles on its own judgement. People review the material, and the 25 profiles were signed off by the Mentor.
3. **Frameworks suited to each kind of life.** A rishi is studied through different questions from a ruler or a scientist. Each group has its own qualities framework, including the DCF Rishi and Ruler parameters.
4. **Honesty about gaps.** If a section lacks good evidence, the profile says so and does not fill the gap. Contested or sensitive statements need stronger sourcing, and 161 were held back because they did not meet that standard.
5. **The knowledge outlives the website.** All 25 profiles are also saved as one data file (`data/exports/dcf-phase1-personalities.json`). DCF can reuse it in a different website, a mobile app, classroom material or an exhibition without this code.

## What you can do with it

| Page | What it is for | How to use it well |
|---|---|---|
| **Home** (`/`) | Starting point | Pick a group or go straight to Explore. |
| **Explore** (`/explore`) | Browse all 25 people | Filter by group, role, era and region, search by name or alternative name, or follow the timeline. |
| **Profile** (`/explore/<name>`) | One person in depth | Read the sections (context, qualities, contributions, challenges, relationships, complexity, relevance today). Use **View … as** to see the person through one lens, for example educator or reformer. Click a citation number to read the source. **Related lives** suggests who to read next. A link to a profile with a lens chosen opens with that lens. |
| **Ask** (`/ai`) | Ask your own questions about a person | Choose a person, then type a question or use a suggestion. Choose a depth (**Simple**, **Balanced**, **Detailed**, **Research**). Follow-up options such as **In its time**, **Who else?** and the lens angles help you go further. Every answer cites its sources. You can rate answers. |
| **Resources** (`/resources`) | Private workspace for DCF board members and editors | Add or edit people, check sources and approve claims, choose which websites live research may read, read visitor feedback, and see what automatic research has done and what it cost. Needs the admin key. |

### Good uses

- **Students and teachers**: a sourced introduction to a person, plus questions for discussion.
- **Speakers and writers**: checking a fact and finding the original source to quote.
- **DCF researchers and editors**: seeing which parts of a profile have thin evidence and improving them, then adding person #26 through the same review process.
- **DCF programmes**: reusing the data file in other formats.

### What to keep in mind

- **Ask is a prototype.** It answers from approved material first, and when that is not enough it searches the web and reads only sources that pass DCF's credibility rules. If it cannot find enough support, it says so or shows the source passages directly. Treat its answers as a well-cited starting point, not a final authority.
- A missing section on a profile means the evidence was not good enough. It does not mean nothing happened.
- Ask depends on paid AI and search services with daily spending limits. When a limit is reached, it falls back to showing evidence passages without a written answer.

## How it is built

The site is a Next.js web application hosted on Vercel. The research database (people, sources, passages, claims and their reviews) is in Supabase. Google Gemini writes the Ask answers, runs grounded web search and creates search embeddings. Brave Search is an optional second search provider. Explore and the profile pages are pre-built from the exported data file, so they load quickly and work even if the AI services are down. Further detail is in [`HANDOFF.md`](../HANDOFF.md) and [`docs/phase1/handoff/`](phase1/handoff/README.md).
