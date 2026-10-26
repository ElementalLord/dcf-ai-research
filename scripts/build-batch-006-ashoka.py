#!/usr/bin/env python3
"""Materialize individually checked Ashokan inscription decisions, without applying them."""

import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / ".corpus-cache/exports/dcf-claims-independent-review-2026-10-18.zip"
OUTPUT = ROOT / "artifacts/corpus-verification/batch-006-decisions.json"
OSLO = "https://www2.hf.uio.no/polyglotta/index.php?page=volume&vid="
THAPAR = "https://projects.mcah.columbia.edu/indianart/pdf/asoka_thapar.pdf"

# Each entry was checked against the University of Oslo's edition of the
# inscriptions and the actual pages of Romila Thapar's translated extracts
# hosted by Columbia. The two translations corroborate a reading of one
# ancient source; they are not independent verification of a king's claims.
# The final wording distinguishes the contents of a royal declaration from
# demonstrated outcomes of governance or diplomacy.
# prefix, volume, edict, Thapar printed page, decision, type, wording, rationale, limitation
ASSESSMENTS = [
    ("aa325491", 362, "Major Rock Edicts, recurring royal titulary; especially II and XIII", "250, 253", "REVISE AND APPROVE", "TEXTUAL_ASSERTION",
     "The major rock edicts identify their issuer as Devanampiya Piyadasi, conventionally translated as the king 'Beloved of the Gods, Piyadasi.'",
     "The edicts repeatedly use this title. The original inference about foregrounding authority is removed because the inscription does not itself establish the author's purpose.",
     "The association of Piyadasi with Ashoka is a historical identification supported by other inscriptions, not a name stated in most major rock edicts."),
    ("be5e3251", 399, "Maski Minor Rock Edict I", "259", "REVISE AND APPROVE", "HISTORICAL_FACT",
     "The Maski version of Minor Rock Edict I names Devanampiya Ashoka, providing inscriptional evidence that connects the Ashoka name with the royal Devanampiya titulary used elsewhere.",
     "The Maski version explicitly names Ashoka; this supports the identification without claiming every Piyadasi inscription independently names him.",
     "The name identification combines inscriptions from different sites."),
    ("03029219", 370, "Pillar Edict VII, public works paragraph", "258", "APPROVE", "TEXTUAL_ASSERTION", None,
     "Pillar VII lists shade trees, mango groves, wells, and rest houses in its catalogue of works for people and animals.",
     "A royal list of works is not independent proof that each work was completed everywhere claimed."),
    ("1e12002c", 362, "Major Rock Edict III, five-year circuits", "251", "REVISE AND APPROVE", "TEXTUAL_ASSERTION",
     "Major Rock Edict III orders yuktas, rajukas and pradesikas to tour every five years for dhamma instruction and other official business.",
     "The cited itinerary occurs in Major Rock Edict III; the original claim misidentified it as Pillar Edict III. The relevant rock inscription was checked directly.",
     "The edict records an order, not independent proof that every tour occurred."),
    ("484c2601", 362, "Major Rock Edict VI, reports and audiences", "251", "APPROVE", "TEXTUAL_ASSERTION", None,
     "Rock Edict VI says reports may reach the king at any time and in several settings; this supports the stated inscriptional ideal.",
     "The edict cannot establish how accessible the king was in practice."),
    ("6587fef5", 362, "Major Rock Edict XIV, short, medium, and expanded versions", "254", "APPROVE", "TEXTUAL_ASSERTION", None,
     "Rock Edict XIV explicitly describes differently sized inscriptions, repetition, and geographic variation.",
     "Purpose is inferred from the king's own explanation, not from a surviving administrative plan."),
    ("70b081cb", 370, "Pillar Edict IV, condemned prisoners", "257", "APPROVE", "TEXTUAL_ASSERTION", None,
     "Pillar IV grants a three-day delay to prisoners sentenced to death. Its continued reference to execution supports the claim's qualification.",
     "The order is not a measure of implementation."),
    ("c00f9223", 364, "Separate Kalinga Edict I, urban officials and five-year inspectors", "255", "REVISE AND APPROVE", "TEXTUAL_ASSERTION",
     "Separate Kalinga Edict I instructs urban magistrates and provides for periodic inspection tours, linking the king's welfare language to named officials.",
     "The source explicitly addresses town magistrates and says appointed officers would tour periodically. 'Dhamma instruction' in the original compressed distinct passages and was narrowed.",
     "The order is a royal claim, not proof of uniform enforcement."),
    ("cc9a5d34", 370, "Pillar Edict IV, judicial uniformity", "257", "APPROVE", "TEXTUAL_ASSERTION", None,
     "Pillar IV calls for uniformity in legal procedure and punishment.",
     "This is a stated aim, not an audited description of the courts."),
    ("e22a25ca", 370, "Pillar Edict VII, dhamma officers and sects", "257–258", "APPROVE", "TEXTUAL_ASSERTION", None,
     "Pillar VII names dhamma officers and their work with religious groups and public welfare.",
     "The edict's appointment claim is direct; the scope of actual activity remains uncertain."),
    ("f560127d", 362, "Major Rock Edict II, medical provision", "250", "APPROVE", "TEXTUAL_ASSERTION", None,
     "Rock II declares two kinds of medical treatment, for humans and animals, in the dominions and named neighboring regions.",
     "The edict is a declaration; medical provision in foreign polities is not independently established."),
    ("1cdd2257", 362, "Major Rock Edict II, southern polities", "250", "REVISE AND APPROVE", "TEXTUAL_ASSERTION",
     "Major Rock Edict II names the Cholas, Pandyas, Satyaputras, Keralaputras and Tambapanni separately from the king's own dominions.",
     "The text explicitly distinguishes dominions from border regions. The broader conclusion about all political communities of the subcontinent was removed.",
     "Its list is not a complete map of Mauryan sovereignty."),
    ("699f3619", 364, "Separate Kalinga Edict I, children and officials", "255", "APPROVE", "TEXTUAL_ASSERTION", None,
     "The edict says 'All men are my children' in an address to officials about welfare and justice.",
     "Paternal language should not be taken as proof of subjects' experience."),
    ("ef6898e4", 362, "Major Rock Edict XIII, remorse and religious households", "253–254", "APPROVE", "TEXTUAL_ASSERTION", None,
     "Rock XIII explicitly expresses remorse and enumerates Brahmanas, ascetics, householders, and harm to kin.",
     "Remorse is the king's stated perspective, not an independently testable inner state."),
    ("1a3e3b52", 362, "Major Rock Edict XIII, conquest by dhamma", "254", "APPROVE", "TEXTUAL_ASSERTION", None,
     "Rock XIII contrasts armed conquest with the king's claimed dhamma victory and calls the latter foremost.",
     "Claims of victory beyond the realm are royal self-presentation."),
    ("1c6ca1ef", 362, "Major Rock Edict XIII, opening Kalinga sentence", "253", "APPROVE", "TEXTUAL_ASSERTION", None,
     "Rock XIII places the conquest in the eighth year after consecration.",
     "The calendar year depends on reconstructing the accession chronology."),
    ("72d5cc0b", 362, "Major Rock Edict XIII, reported casualties", "253", "REVISE AND APPROVE", "TEXTUAL_ASSERTION",
     "Major Rock Edict XIII says that 150,000 people were deported, 100,000 killed, and many times that number died in the conquest of Kalinga.",
     "The casualty categories and numbers are explicit; the original comparative claim that the statement was 'exceptional' requires broader historical comparison and was removed.",
     "Royal casualty numbers are not independently audited."),
    ("bb4d1e8f", 362, "Major Rock Edict XIII, Kalinga casualty figures", "253", "APPROVE", "TEXTUAL_ASSERTION", None,
     "The figures are in the royal edict; the original wording already distinguishes an inscriptional report from audited casualties.",
     "The casualties may be rhetorical or approximate."),
    ("0a07ea19", 362, "Major Rock Edict II, Antiochus and neighboring polities", "250", "APPROVE", "TEXTUAL_ASSERTION", None,
     "Rock II names Antiochus and several neighbors while proclaiming human and animal medical measures.",
     "Reference to a king abroad establishes the claimed geographic horizon, not confirmed delivery of medical services there."),
    ("145b3ed1", 362, "Major Rock Edict XIII, Hellenistic rulers", "254", "APPROVE", "TEXTUAL_ASSERTION", None,
     "Rock XIII names Antiochus and other Greek rulers within its dhamma-victory rhetoric; the claim properly avoids asserting their compliance.",
     "Named rulers help chronological interpretation but do not independently prove diplomatic missions."),
    ("12073932", 362, "Major Rock Edict XII, sectarian speech", "253", "APPROVE", "TEXTUAL_ASSERTION", None,
     "Rock XII cautions against glorifying one's sect by disparaging another without cause.",
     "This is an imperial prescription, not evidence of universal religious tolerance in practice."),
    ("703d0b52", 399, "Minor Rock Edict I, lay devotion and sangha", "259", "REVISE AND APPROVE", "TEXTUAL_ASSERTION",
     "In Minor Rock Edict I, the king describes himself as a Buddhist lay follower and says he had visited the sangha.",
     "The Rupnath and Brahmagiri versions describe his religious status and visit. The wording is tied to the inscription rather than asserting a directly observed private belief.",
     "English renderings vary between 'lay follower,' 'upasaka,' and 'Sakya'."),
    ("a0e13cea", 399, "Bairat/Bhabru inscription, recommended teachings", "259", "APPROVE", "TEXTUAL_ASSERTION", None,
     "The Bairat text directly recommends named Buddhist teachings to monks, nuns, and lay followers.",
     "Textual patronage does not by itself establish the extent of Buddhist practice across the empire."),
    ("b1f391e8", 378, "Nigali Sagar pillar inscription", "260", "REVISE AND APPROVE", "TEXTUAL_ASSERTION",
     "The Nigali Sagar pillar inscription says the king enlarged the stupa of the Buddha Konakamana and later visited and worshipped at the site.",
     "The inscription records these acts, but its surviving text is damaged; the original assertion of completed acts was reframed as inscriptional testimony.",
     "The twentieth-year reading and erection clause are partly restored in published translations."),
    ("e95a563f", 378, "Lumbini/Rummindei pillar inscription", "260", "REVISE AND APPROVE", "TEXTUAL_ASSERTION",
     "The Lumbini pillar inscription says the king visited and worshipped at the site identified there as the Buddha's birthplace and granted the village a reduced tax obligation.",
     "The royal visit, identification, and tax provision are all explicit. The wording distinguishes the inscription's birthplace identification from independently verifying that ancient event.",
     "Tax translations vary in detail; the narrow phrase 'reduced tax obligation' is supported by both checked renderings."),
]

with zipfile.ZipFile(EXPORT) as archive:
    originals = [json.loads(line) for line in archive.open("claims_audit.jsonl") if line.strip()]

assert len(ASSESSMENTS) == 25
assert len({a[0] for a in ASSESSMENTS}) == len(ASSESSMENTS)
output = []
for prefix, volume, edict, pages, decision, kind, wording, rationale, limitation in ASSESSMENTS:
    matches = [row for row in originals if row["claim_id"].startswith(prefix)]
    assert len(matches) == 1, prefix
    row = matches[0]
    assert row["personality_name"] == "Ashoka", prefix
    oslo_url = OSLO + str(volume)
    linked = [link for link in row["sources"] if link["source"].get("url") == oslo_url]
    # The one corrected III claim was originally mislinked to the pillar
    # volume. Its final decision uses the checked rock volume, with no
    # pre-existing link ID. Do not silently pretend the old link supports it.
    assert len(linked) == (0 if prefix == "1e12002c" else 1), prefix
    output.append({
        "claim_id": row["claim_id"],
        "personality": "Ashoka",
        "original_claim_text": row["claim_text"],
        "decision": decision,
        "final_proposed_wording": wording or row["claim_text"],
        "epistemic_type": kind,
        "evidence_references": [
            {
                "source_id": linked[0]["source_id"] if linked else None,
                "url": oslo_url,
                "locator": edict,
                "source_authority": "University of Oslo Bibliotheca Polyglotta edition of Ashokan inscriptions, based on Hultzsch's epigraphic transcription and translation",
                "independence_assessment": "Contemporary royal inscription; primary for what the court proclaimed, not independent proof of policy outcomes",
                "original_source_inspected": True,
            },
            {
                "source_id": None,
                "url": THAPAR,
                "locator": f"Romila Thapar, 'A Translation of the Edicts of Asoka,' printed p. {pages} (PDF pages {', '.join(str(int(p.strip()) - 249) for p in pages.replace('–', ',').split(','))})",
                "source_authority": "Scholarly translation by historian Romila Thapar, hosted by Columbia University",
                "independence_assessment": "A second scholarly translation of the same inscription, not independent confirmation of events claimed by the ruler",
                "original_source_inspected": True,
            },
        ],
        "verification_rationale": rationale,
        "original_source_inspected": True,
        "material_limitation": limitation,
        "removal_reason": None,
    })

OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
print(f"Wrote {len(output)} source-checked Ashoka decisions to {OUTPUT}")
