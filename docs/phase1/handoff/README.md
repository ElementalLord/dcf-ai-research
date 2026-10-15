# DCF Inspiring Personalities Phase 1 handoff

This is the starting point for anyone taking over the DCF Inspiring Personalities work. Phase 1 created an evidence-grounded collection of 25 inspiring personalities and a working website for exploring them. The knowledge asset is portable: it can be reused without the present website.

## The three tracks

### Track 1 — primary knowledge deliverable

Track 1 produced the approved 25-person corpus, arranged for public presentation as five groups of five. Behind each profile is a category-specific qualities framework, a source library, source passages, evidence-grounded claims, provenance, review states, lenses, and rules for handling contested material. It also produced:

- an application-independent JSON dataset;
- a repeatable exporter;
- a documented schema and content pipeline;
- a readable Mentor review package and approval record.

Track 1 is complete and is treated as Mentor-approved under the final project handoff.

### Track 2 — public demo

Track 2 produced the public discovery and profile experience. Visitors can browse five categories, search and filter all 25 people, choose relevant lenses, read structured profiles, inspect citations and source details, and move to related personalities. The Resources interface supports internal research work. Ask is an additional prototype, not a required Phase 1 deliverable.

The application builds successfully and all 25 profile routes have been verified. Connecting the repository to the existing deployment provider and completing desktop/mobile checks on the deployed URL remain user actions.

### Track 3 — handoff and closeout

Track 3 is this documentation package. It explains the system, operating procedures, governance, limitations, deployment, manual smoke testing, and recommended Phase 2 direction.

## Read these first

1. This page for scope and status.
2. [Architecture overview](architecture-overview.md) for how the knowledge and application layers fit together.
3. [How to run the project](how-to-run.md) for local setup and validation.
4. [How to add personality #26](how-to-add-a-personality.md) before changing the corpus.
5. [Known limitations](known-limitations.md) before making acceptance or publication decisions.
6. [Final acceptance checklist](../FINAL-ACCEPTANCE-CHECKLIST.md) for the authoritative closeout status.

## Important locations

| Purpose | Location |
|---|---|
| Portable Phase 1 dataset | [`data/exports/dcf-phase1-personalities.json`](../../../data/exports/dcf-phase1-personalities.json) |
| Five-group public mapping | [`data/phase1-presentation.json`](../../../data/phase1-presentation.json) |
| Dataset schema | [Dataset schema](../dataset-schema.md) |
| Full content workflow | [Content pipeline SOP](../content-pipeline-sop.md) |
| Repeatable exporter | [`scripts/export-phase1-personalities.mjs`](../../../scripts/export-phase1-personalities.mjs) |
| Mentor review package | [Mentor review index](../mentor-review/README.md) |
| Track 1 acceptance | [Track 1 checklist](../track1-acceptance-checklist.md) |
| Track 2 acceptance | [Track 2 checklist](../track2-acceptance-checklist.md) |
| Overall Phase 1 acceptance | [Final acceptance checklist](../FINAL-ACCEPTANCE-CHECKLIST.md) |
| Leadership summary | [Mentor / DCF summary](../mentor-summary.md) |
| Deployment and smoke test | [Deployment guide](deployment.md) |
| Phase 2 roadmap | [Phase 2 recommendations](phase2-recommendations.md) |

## Current status

- Track 1: complete and approved.
- Track 2: implementation and local validation complete; deployment and deployed visual QA require user action.
- Track 3: complete.
- Export: 25 personalities in five approved Phase 1 presentation categories.
- Current demo implementation commit: `baa1458`.

Do not infer publication approval from an AI-generated claim, a source being reachable, or a successful build. The review and governance rules in the [content pipeline SOP](../content-pipeline-sop.md) remain authoritative.
