# Track 2 Phase 1 acceptance checklist

Validated on 2026-10-15 against the Mentor-approved Track 1 export and the production Next.js build.

Track 1 is recorded as complete and approved per the Track 2 handoff. The public five-category mapping is a separate data layer; the detailed research taxonomy and database history remain unchanged.

| Status | Requirement | Evidence / remaining action |
|---|---|---|
| **PASS** | Reads from approved Track 1 data | Public discovery and profiles read `data/exports/dcf-phase1-personalities.json`; no separate frontend personality corpus exists. |
| **PASS** | 25/25 approved personalities available | Focused tests and production-route checks verify 25 unique slugs and 25 resolvable static profile routes. |
| **PASS** | Official five-category presentation | `data/phase1-presentation.json` contains five approved presentation groups of five stable personality IDs; the export validates exact membership. |
| **PASS** | Search | Name/alias matches take priority; partial-name checks cover Vivekananda, Raman, Bose, Tata, Ray, and Ashoka. Approved metadata is a fallback. |
| **PASS** | Filtering | Presentation category and reliable detailed role/type filters combine with search. Empty era/region fields are not exposed as useless filters. |
| **PASS** | Lens selection | Each profile exposes only its exported lenses. Selecting one changes section order and surfaces matching sourced statements in a dedicated focus area. |
| **PASS** | Structured profile pages | All 25 static profiles show only populated sections: introduction, context, qualities, contributions, relationships, challenges, complexities, and relevance as available. |
| **PASS** | Source visibility | Statement markers link to expandable source records with title, publisher/author, type, locator, evidence excerpt, and original URL when available. |
| **PASS** | Related-personality exploration | Three deterministic suggestions use shared approved presentation category, detailed category, and lenses, with an understandable reason. |
| **PARTIAL** | Desktop usability | Responsive layout, keyboard states, production HTML, and desktop route content are verified. Final visual browser inspection is pending because local browser access was denied by the browser permission layer. |
| **PARTIAL** | Mobile usability | Mobile breakpoints, touch target rules, non-overflowing controls, and responsive source/lens layouts are implemented. Final device-width visual inspection is pending for the same browser-access reason. |
| **PASS** | Production build | `npm run build` succeeds; `/explore` is static and all 25 `/explore/[slug]` routes are generated as SSG pages. |
| **USER ACTION REQUIRED** | Live deployment status | No hosting-project metadata, CI deployment workflow, or Git remote is present. Connect this repository to the existing hosting project, configure `.env.example` variables, deploy, and perform the final desktop/mobile visual smoke check on the live URL. |

## Validation completed

- `npm run typecheck`
- targeted ESLint for Track 2 files
- `npx vitest run tests/phase1-demo.test.ts`
- `npm run build`
- `node scripts/verify-phase1-demo.mjs <production-server-url>`
- `git diff --check`

No AI requests, paid-model evaluations, live-search runs, new research, claims, or personalities were added.
