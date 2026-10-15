# DCF Phase 1 portable dataset schema

This document explains `data/exports/dcf-phase1-personalities.json` for interns, educators, reviewers, and developers. The JSON file is a portable research deliverable: reading it does not require Next.js, React, Supabase, or the DCF website.

Regenerate it from the live DCF database with:

```bash
node --env-file=.env.local scripts/export-phase1-personalities.mjs
```

The command is read-only with respect to the database. It replaces only generated export and Mentor-package files in this repository. It never approves claims or records Mentor sign-off.

## Top-level fields

| Field | Required | Meaning |
|---|---|---|
| `schemaVersion` | Yes | Version of this portable JSON structure. Consumers should check it before importing. |
| `title` | Yes | Human-readable dataset name. |
| `generatedAt` | Yes | UTC date and time when the live database was read. |
| `sourceOfTruth` | Yes | Identifies the live DCF database as the origin. |
| `applicationIndependent` | Yes | Confirms that the JSON has no frontend or Supabase runtime dependency. |
| `policies` | Yes | Plain-language rules used to select profile statements and handle review and contested material. |
| `summary` | Yes | Counts and acceptance-level results for the complete export. |
| `categoryAudit` | Yes | Every defined category, its members, and its full qualities/parameters framework. |
| `personalities` | Yes | The 25 portable personality records. |

## Personality record

Every object in `personalities` has the following fields.

| Field | Required | Meaning |
|---|---|---|
| `id` | Yes | Stable database UUID. Use this—not the display name—as the import key. |
| `name` | Yes | Canonical display name. |
| `alternateNames` | Yes | Alternate spellings or names stored on the identity record; may be empty. |
| `aliases` | Yes | Detailed alias records, including type, confidence, ambiguity, and notes. |
| `type` | Yes when categorized | Name of the primary current category. |
| `category` | Yes when categorized | Primary category ID, slug, name, and `isPrimary` flag. |
| `categories` | Yes | All current category memberships. This preserves secondary and historical structure rather than flattening it. |
| `phase1PresentationCategory` | Yes | The Mentor-approved public Phase 1 category. The mapping is stored in `data/phase1-presentation.json` and does not replace detailed research categories. |
| `phase1PresentationCategoryStatus` | Yes | Records the presentation mapping as `approved_per_track2_handoff`. This preserves the supplied approval state without inventing a Mentor identity, signature, or date. |
| `era` | Optional | Structured era from the identity record. `null` means it has not been populated; dated statements may still exist in `lifeAndContext`. |
| `region` | Optional | Structured region from the identity record. `null` means it has not been populated; geographic statements may still exist in cited profile content. |
| `shortIntroduction` | Yes | Up to two sourced statements selected from life/context and contribution evidence. |
| `lifeAndContext` | Yes | Sourced statements about vocation, formation, identity, historical setting, and social context. May be empty only when the readiness audit flags a blocker. |
| `qualitiesValues` | Yes | Sourced values, virtues, teachings, methods, disciplines, or inner qualities appropriate to the person. |
| `contributions` | Yes | Sourced works, discoveries, institutions, public action, or other principal contributions. |
| `challenges` | Yes | Sourced obstacles, limits, conflict, persistence, or trade-offs. |
| `leadershipRelationalCharacteristics` | Yes | Sourced leadership, mentorship, collaboration, lineage, advisory, or relational material. It may be empty when the dimension is not relevant or not sufficiently supported. |
| `contestedAspects` | Yes | Only contested or sensitive statements that pass the enhanced sourcing rule. |
| `contemporaryRelevance` | Yes | Sourced legacy, impact, recognition, service, or present-day relevance. |
| `lenses` | Yes | Relevant angles inherited from the current research categories, such as `historical`, `scientific`, `spiritual`, or `leadership`. They guide interpretation; they are not factual claims. |
| `sources` | Yes | Full metadata for every source linked to this person’s evidence register, including sources not selected into the concise profile. |
| `citations` | Yes | Source IDs used by the concise profile sections. Join these IDs to `sources`. |
| `sourceMetadata` | Yes | Counts of linked sources, approved credible sources, and source types. |
| `reviewStatus` | Yes | Profile readiness, claim-state counts, approval-origin counts, unresolved concerns, Mentor status, and withheld sourcing violations. |
| `frameworkMetadata` | Yes | Category framework IDs, represented field IDs, and the deterministic profile-section method. |
| `evidenceRegister` | Yes | The complete claim-level record for portability, provenance, later review, and regeneration. The readable profile fields above are the primary audience-facing representation. |

## Profile statement and citation

Each item in a readable profile section contains:

- `claimId`: the stable claim UUID.
- `text`: the database claim text with whitespace normalized and terminal punctuation added when needed. The exporter does not invent facts or silently rewrite the claim.
- `reviewStatus`: `approved`, `needs_review`, `draft`, or `rejected`. Rejected claims are never selected.
- `approvalOrigin`: who or what produced the approval state, such as `human_manual`, `mentor_review`, `imported_existing`, `system_test_bulk`, or `ai_candidate`.
- `certainty`, `evidenceType`, and `claimKind`: the database’s epistemic and content classifications.
- `framework`: the category parameter and field to which the statement belongs.
- `citations`: one or more evidence links with `sourceId`, relationship, locator, and evidence excerpt.

Use `sourceId` to find full author, institution, URL, citation, source type, textual layer, and approval metadata in the personality’s `sources` array.

## Categories and frameworks

`categoryAudit` preserves all defined categories—even a category with no current members. Each category contains its current personalities and a `framework` array. A framework is a set of research dimensions called parameters. Each parameter contains one or more fields, which are the precise topics used to tag claims and passages.

A person may belong to more than one category. `isPrimary` identifies the principal current framework; secondary memberships must not be discarded. The official five Phase 1 presentation categories are deliberately separate from these research categories because the live database does not currently define an approved five-group consolidation.

## Review status

Profile readiness and claim approval are different:

- `ready_for_mentor_review` means the exporter found a sourced introduction, at least one life/context statement, at least one contribution statement, at least eight distinct selected statements, and at least three supporting sources. An optional or inapplicable dimension may still be empty, but the gap is listed rather than filled by inference.
- `blocked_pending_evidence_or_revision` means at least one core section lacks an eligible sourced statement.
- `mentorApproval: not_recorded` means exactly that. Neither an approved database claim nor this generated file is Mentor sign-off.
- `selectedApprovedClaims` counts approved claims in the concise draft.
- `selectedAwaitingReviewClaims` counts draft or needs-review claims shown transparently for the Mentor to assess.
- `unresolvedConcerns` lists missing structure, pending review volume, and omitted sensitive material.

The full `evidenceRegister` retains every claim’s own state. Never bulk-change claim status merely to make a profile appear complete.

## Contested material

A claim is treated as contested or sensitive when its evidence/claim type or framework field explicitly identifies contest, controversy, sensitivity, or criticism. Such a statement is selected only when it has:

1. at least two independent approved credible sources, and
2. at least one primary-text or scholarly source.

Independence is assessed by source domain, then institution/author when no domain is available. A failure is recorded in `reviewStatus.sourcingStandardViolationsWithheld` and omitted from `contestedAspects`. Omission is not a judgment that the statement is false; it means the present evidence package does not meet the publication standard.

## Evidence register

The evidence register makes the export portable without turning the public-facing profile into a raw claim dump. It includes:

- claim text and classifications;
- framework location;
- review and approval provenance;
- epistemic-contract assessment when present;
- all source links and locators;
- whether the claim was eligible for the profile and, if not, why;
- creation and update timestamps.

Future systems may rebuild a different presentation from this register, but they must continue to respect claim review status, source approval, contested-claim rules, and Mentor decisions.
