# Human review and publication governance

This page explains who may move material from research into a public DCF profile. It complements the detailed [content pipeline SOP](../content-pipeline-sop.md); it does not create a second workflow.

## Publication model

AI may assist with source discovery, extraction, classification, comparison, gap detection, and draft wording. Its output is a candidate, not an authority. A generated answer, high model confidence, successful citation check, or completed export cannot approve knowledge.

For a factual statement to appear in a final profile:

1. it must be supported by a registered, credible source and a traceable passage or locator;
2. its wording must match what the evidence establishes;
3. its epistemic type and uncertainty must be represented accurately;
4. a human reviewer must decide that the claim is suitable and supported;
5. contested or sensitive material must meet the enhanced evidence standard;
6. the complete profile must receive Mentor sign-off before publication.

For the 25-person Phase 1 corpus, the final handoff supplies the Mentor-approved profile state. The export records this as `approved_per_track2_handoff` without inventing a reviewer name, signature, or date. Internal atomic claims retain their original review states and provenance.

## Different decisions must remain separate

- **Source authority** asks whether a source is appropriate and credible for the intended use.
- **Claim certainty** asks how strongly the cited material establishes the proposition.
- **Claim review** asks whether the wording, classification, citations, and framework placement are acceptable.
- **Profile readiness** is a deterministic completeness check used by the exporter.
- **Mentor approval** is the final curatorial publication decision for the assembled profile.
- **Network access approval** only authorizes a system to fetch a location; it says nothing about the truth or quality of its content.

One state never implies another. In particular, an authoritative institution may publish a primary narrative that proves what the text says but does not automatically establish every narrated event as historical fact. The claim must identify whether it is direct historical evidence, a primary-text attribution, traditional narrative, scholarly interpretation, inference, or modern interpretation.

## Contested and sensitive material

Every ordinary factual profile statement requires at least one approved credible source. Contested or sensitive statements require at least two independent credible sources, with at least one primary or scholarly source. Independence must be real; reproductions of the same underlying account do not count as separate corroboration.

When the stronger standard is not met, the statement stays outside the final profile and the reason is recorded. Withholding is a publication decision about the current evidence package, not a declaration that the statement is false.

## Review responsibilities

- The **researcher or intern** gathers evidence, records metadata and locators, drafts atomic claims, and responds to requested changes.
- The **human reviewer** evaluates source suitability, evidentiary support, wording, epistemic type, balance, and framework placement; the reviewer approves, requests changes, or rejects the claim.
- The **Mentor** resolves final curatorial questions, sensitive inclusion, official presentation decisions, and complete-profile sign-off.
- The **developer or publisher** verifies that the deployed application uses the authorized export and does not expose draft-only or internal operational material as approved content.

## Audit trail

The audit trail is preserved through stable identity, source, passage, and claim IDs; source metadata and locators; claim-source relationships; review status and approval origin; reviewer decisions and notes when recorded; timestamps; framework placement; withheld-material reasons; and the generated evidence register in the portable export.

Rejected or superseded research records should be retained according to DCF policy rather than silently overwritten. Material changes to an approved claim return through review. Mentor sign-off is recorded separately from atomic claim approval so later users can tell what was reviewed, by whom, at which level, and for which published profile version.

## Publication gate

Before release, verify the profile against the signed-off review package, regenerate and validate the portable dataset, run the public route checks, and complete the deployment smoke test. If evidence or wording changes after sign-off, return the affected material to human and Mentor review before republishing.
