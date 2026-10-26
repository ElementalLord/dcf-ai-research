"""Worker-owned, explicitly reviewed Vishvamitra decisions.

Only the claim IDs listed below were checked against the cited verse passages.
This is intentionally not a bulk classifier.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = {x['claim_id']: x for x in map(json.loads, (ROOT/'decision-ledger.jsonl').open())}
AUDIT = (ROOT/'audit/24-vishvamitra-FULL-REVIEW.md').read_text()
GLOBAL_SOURCE_IDS = {u: sid for sid,u in re.findall(r'- Source \d+: `([0-9a-f-]+)` — (https?://\S+)',AUDIT)}
SOURCES = {
    '22': ('https://www.valmikiramayan.net/utf8/baala/sarga22/balasans22.htm', 'Valmiki Ramayana, Bala Kanda 1.22, Sanskrit text with Desiraju Hanumanta Rao English rendering; passage checked 2026-10-19'),
    '21': ('https://www.valmikiramayan.net/utf8/baala/sarga21/bala_21_prose.htm', 'Valmiki Ramayana, Bala Kanda 1.21, Desiraju Hanumanta Rao prose English rendering; corresponding Sanskrit verse page also checked 2026-10-19'),
    '28': ('https://www.valmikiramayan.net/utf8/baala/sarga28/bala_28_prose.htm', 'Valmiki Ramayana, Bala Kanda 1.28, Desiraju Hanumanta Rao English rendering; passage checked 2026-10-19'),
    '63': ('https://www.valmikiramayan.net/utf8/baala/sarga63/bala_63_prose.htm', 'Valmiki Ramayana, Bala Kanda 1.63, Desiraju Hanumanta Rao English rendering; passage checked 2026-10-19'),
    '65': ('https://www.valmikiramayan.net/utf8/baala/sarga65/balasans65.htm.orig', 'Valmiki Ramayana, Bala Kanda 1.65, Sanskrit text with Desiraju Hanumanta Rao English rendering; passage checked 2026-10-19'),
    '64': ('https://www.valmikiramayan.net/utf8/baala/sarga64/balasans64.htm', 'Valmiki Ramayana, Bala Kanda 1.64, Sanskrit text with Desiraju Hanumanta Rao English rendering; passage checked 2026-10-19'),
    '3.1': ('https://vedicheritage.gov.in/samhitas/rigveda/shakala-samhita/mandal-03/', 'Government of India Vedic Heritage Portal, Rigveda 3.1 Sanskrit text and seer metadata; passage checked 2026-10-19'),
    '3.62': ('https://vedicheritage.gov.in/hi/samhitas/rigveda/shakala-samhita/rigveda-shakala-samhita-mandal-03-sukta-062/', 'Government of India Vedic Heritage Portal, Rigveda 3.62 Sanskrit text and seer metadata; passage checked 2026-10-19'),
}

# prefix, decision, final wording, epistemic type, source chapter, precise verses, rationale
REVIEWS = [
 ('35c9c378','REVISE AND APPROVE','In Bala Kanda 1.22, Dasharatha entrusts Rama to Vishvamitra, who then guides and instructs him.','TRADITIONAL_NARRATIVE','22','1.22.2–3, 11–22','Entrustment and teaching are explicit; guardianship is an interpretive label.'),
 ('3cb766e5','APPROVE',None,'TRADITIONAL_NARRATIVE','22','1.22.10–12, 20–22','The south bank of the Sarayu is stated before the Bala–Atibala teaching and their stay there.'),
 ('596594fb','APPROVE',None,'TEXTUAL_ASSERTION','22','1.22.2–3, 8–10','The Sanskrit uses kushikaputra/kushikasuta for Vishvamitra.'),
 ('77471114','REVISE AND APPROVE','Bala Kanda 1.22 portrays Vishvamitra teaching Rama the Bala and Atibala formulae, followed by Rama performing duties toward his teacher.','TRADITIONAL_NARRATIVE','22','1.22.11–12, 20–22','The passage directly supplies instruction and pupil duties; the abstract modern language was narrowed.'),
 ('79dc18aa','REVISE AND APPROVE','In Vishvamitra’s speech in Bala Kanda 1.22, Bala and Atibala are said to protect Rama from fatigue and attacks while asleep, and to avert hunger and thirst. These are claims within the epic.','TRADITIONAL_NARRATIVE','22','1.22.12–13, 17','Direct speech presents extraordinary effects; wording attributes them to the text.'),
 ('7ba43136','APPROVE',None,'TRADITIONAL_NARRATIVE','22','1.22.20–22','Rama receives the teachings and performs duties to Vishvamitra as guru.'),
 ('b070cd29','REVISE AND APPROVE','Bala Kanda 1.22 presents Bala and Atibala as teachings Vishvamitra transmits to Rama and says their practice and ascetic cultivation produce effects within the story.','TRADITIONAL_NARRATIVE','22','1.22.11–12, 19–22','Narrowed from general disciplines to the text’s teaching scene.'),
 ('b8f844d3','APPROVE',None,'TRADITIONAL_NARRATIVE','22','1.22.6–10, 20–23','Lakshmana accompanies Rama; the direct teaching speech addresses Rama.'),
 ('ef713392','APPROVE',None,'TRADITIONAL_NARRATIVE','22','1.22.6–12, 20–23','The chapter portrays guidance and transmission to Rama on the joint journey.'),
 ('917c9de6','REMOVE FROM ACTIVE CORPUS',None,'TRADITIONAL_NARRATIVE','22','1.22.12–13, 17','Verified substance repeats claim 79dc18aa, which retains the traditional attribution.'),
 ('97f0b346','APPROVE',None,'TRADITIONAL_NARRATIVE','22','1.22.12–17','The claimed bodily benefits appear in Vishvamitra’s epic speech, not independent experimental evidence.'),
 ('d966314a','APPROVE',None,'TRADITIONAL_NARRATIVE','22','1.22.2–3, 6–12, 20–23','The journey with both princes and the Bala–Atibala teaching are explicit.'),
 ('06015b7f','REVISE AND APPROVE','Bala Kanda 1.65 narrates that after a long vow Vishvamitra offered all his prepared food to Indra in Brahmin disguise, foregoing his own meal and continuing his silence.','TRADITIONAL_NARRATIVE','65','1.65.4–7','Both deprivation and gift are explicit; “tension” was interpretive.'),
 ('1e2b8e30','REVISE AND APPROVE','Bala Kanda 1.65 places Vishvamitra’s gift of his entire prepared meal to a disguised supplicant before its later imagery of breath restraint and smoke from his head.','TRADITIONAL_NARRATIVE','65','1.65.4–9','Replaced editorial direction with the chapter’s actual sequence.'),
 ('23be0733','APPROVE',None,'TRADITIONAL_NARRATIVE','65','1.65.4–7','The chapter expressly says he gave the meal and maintained silence.'),
 ('2c34ef2c','REVISE AND APPROVE','Bala Kanda 1.65 says Vishvamitra left the Himalayan north and moved east for another stage of austerity.','TRADITIONAL_NARRATIVE','65','1.65.1–2','The original’s “northern Himalaya to its eastern region” overstates a geographical precision the verse does not give.'),
 ('4d7839f8','APPROVE',None,'TRADITIONAL_NARRATIVE','65','1.65.8–16','Smoke and cosmic distress are narrated as supernatural epic imagery.'),
 ('54f22437','APPROVE',None,'TRADITIONAL_NARRATIVE','65','1.65.8–9','The text presents another thousand years without respiration; original already marks it as epic motif.'),
 ('960e78c9','APPROVE',None,'TRADITIONAL_NARRATIVE','65','1.65.8–9','The described smoke and cosmic distress are in the text, and the claim rules out physiological reading.'),
 ('b358938a','REMOVE FROM ACTIVE CORPUS',None,'TRADITIONAL_NARRATIVE','65','1.65.4–7','Substance repeats the more precise retained claim 06015b7f.'),
 ('fd077ec7','REMOVE FROM ACTIVE CORPUS',None,'TRADITIONAL_NARRATIVE','65','1.65.4–7','Substance repeats the more precise retained claim 06015b7f.'),
 ('311c35fc','APPROVE',None,'TRADITIONAL_NARRATIVE','65','1.65.1–3, 6–9','Vow of silence and severe tapas are explicit.'),
 ('375deee8','APPROVE',None,'TRADITIONAL_NARRATIVE','65','1.65.19–27','The gods recognize him, then Vasistha accepts him as Brahmarshi.'),
 ('5c040721','REMOVE FROM ACTIVE CORPUS',None,'TRADITIONAL_NARRATIVE','65','1.65.4–7','Exact factual duplicate of retained claim 06015b7f.'),
 ('c0e8ed43','REVISE AND APPROVE','In the Bala Kanda tradition, Vishvamitra’s extended ascetic narrative culminates in Brahma’s and Vasistha’s recognition of him as a Brahmarshi. This is an epic status, not a historical credential.','TRADITIONAL_NARRATIVE','65','1.65.19–28','The inspected chapter proves the culmination but does not alone establish the earlier royal status.'),
 ('0c49c16d','APPROVE',None,'TRADITIONAL_NARRATIVE','65','1.65.19–28','Vasistha explicitly calls him Brahmarshi after divine recognition.'),
 ('21eef295','APPROVE',None,'TEXTUAL_ASSERTION','65','1.65.19–28','This is a fact about the epic narrative, not about independently established biography.'),
 ('1a10ad90','REVISE AND APPROVE','Bala Kanda 1.63 recounts Brahma addressing Vishvamitra as a kingly sage (rajarshi) before later stages of ascetic recognition.','TRADITIONAL_NARRATIVE','63','1.63.1–3','The source has the title; “first” could imply a broader chronology than this passage establishes.'),
 ('28fae74f','APPROVE',None,'TRADITIONAL_NARRATIVE','63','1.63.4–11','The Menaka stay is said to last ten years before renewed austerity.'),
 ('2b83e277','APPROVE',None,'TRADITIONAL_NARRATIVE','63','1.63.8–16','The chapter links remorse to renewed austerity.'),
 ('5909bf8a','REVISE AND APPROVE','Bala Kanda 1.63 depicts Maharshi as an intermediate recognition: after another long austerity Brahma grants that title, but says Vishvamitra has not yet conquered his senses.','TRADITIONAL_NARRATIVE','63','1.63.17–20','Narrowed cross-chapter editorial advice to the inspected episode.'),
 ('7562e441','APPROVE',None,'TRADITIONAL_NARRATIVE','63','1.63.16–19','A thousand-year austerity precedes the gods’ approach in the translation; this is epic sacred chronology.'),
 ('921abb4e','REVISE AND APPROVE','Bala Kanda 1.63 narrates a ten-year stay with Menaka, Vishvamitra’s regret over interrupted austerity, and his return to severe tapas.','TRADITIONAL_NARRATIVE','63','1.63.4–16','Removed the editorial phrase “not just a seduction anecdote”.'),
 ('b6948da1','APPROVE',None,'TRADITIONAL_NARRATIVE','63','1.63.16–20','Maharshi is granted, Vishvamitra seeks Brahmarshi, and Brahma says further effort is needed.'),
 ('8e7bea8b','APPROVE',None,'TEXTUAL_ATTRIBUTION','3.1','Rigveda 3.1 seer metadata, portal line 414','The portal explicitly identifies Gathina Vishvamitra as seer and Agni as deity. This is a traditional rishi attribution, not modern authorship proof.'),
 ('95e35dcf','APPROVE',None,'TEXTUAL_ASSERTION','3.1','Rigveda 3.1.21, portal lines 453–456','Verse 21 uses the plural Vishvamitras; the claim draws a cautious implication about family/collective usage.'),
 ('2490638e','APPROVE',None,'TRADITIONAL_NARRATIVE','21','1.21.5–22','Vasistha praises Vishvamitra and urges Dasharatha to send Rama with him.'),
 ('4e722593','REVISE AND APPROVE','In Bala Kanda 1.21, Vasistha argues that Vishvamitra can protect Rama and persuades Dasharatha to let Rama accompany him.','TRADITIONAL_NARRATIVE','21','1.21.9–10, 20–22','The action and persuasion are explicit; “recognized standing” was an inference.'),
 ('bf922fd9','REVISE AND APPROVE','In Vasistha’s speech in Bala Kanda 1.21, Vishvamitra is praised for knowledge of many astras and described as beyond the knowledge of gods, sages, and other beings. This is epic praise within Vasistha’s speech.','TRADITIONAL_NARRATIVE','21','1.21.11–12','The verse praises his knowledge and says others cannot know him; it does not literally say that the astras are unknown to all those beings.'),
 ('d1590d47','APPROVE',None,'TRADITIONAL_NARRATIVE','21','1.21.11–20','Vasistha describes knowledge of astras and ability to generate new ones.'),
 ('ffcc8e6e','APPROVE',None,'TRADITIONAL_NARRATIVE','21','1.21.9, 20–22','Vasistha explicitly says Rama is safe whether trained or untrained and persuades Dasharatha.'),
 ('003a9c62','REVISE AND APPROVE','Bala Kanda 1.28 narrates Rama asking Vishvamitra for knowledge of how to annul astras after receiving them, and Vishvamitra teaching him that knowledge.','TRADITIONAL_NARRATIVE','28','1.28.1–5, prose lines 9–14','Directly supported event replaces an editorial claim about pedagogical completeness.'),
 ('178faf90','APPROVE',None,'TRADITIONAL_NARRATIVE','28','1.28.1–5, prose lines 9–14','Rama asks for annulment knowledge and receives it.'),
 ('2544eb75','REVISE AND APPROVE','In Bala Kanda 1.28, Vishvamitra teaches Rama methods of annulling astras after Rama asks for them; the preceding chapter covers the original grant of astras.','TRADITIONAL_NARRATIVE','28','1.28.1–5, prose lines 9–14','The text speaks of annulment missiles, and “control and recall” was too broad.'),
 ('414589e3','REVISE AND APPROVE','Bala Kanda 1.28 presents instruction in neutralizing astras after Rama has received projectile astras. This is part of the epic’s martial instruction narrative.','TRADITIONAL_NARRATIVE','28','1.28.1–5, prose lines 9–14','The passage supports neutralization; “restraint and reversibility as competent practice” is modern interpretation.'),
 ('cde8a2ea','REMOVE FROM ACTIVE CORPUS',None,'TRADITIONAL_NARRATIVE','28','1.28.1–5, prose lines 9–14','Substance duplicates retained and more narrowly worded claim 2544eb75.'),
 ('2c8cdc9c','APPROVE',None,'TRADITIONAL_NARRATIVE','64','1.64.11–17','The curse is followed by regret and a decision to control anger.'),
 ('51c9b51f','APPROVE',None,'TRADITIONAL_NARRATIVE','64','1.64.11–17','Verse 12 says he seeks victory over desire and anger; verses 14–17 narrate the failure and renewed vow.'),
 ('9559d070','APPROVE',None,'TRADITIONAL_NARRATIVE','64','1.64.11–17','The sequence shows severe tapas, anger, remorse, and renewed self-discipline.'),
 ('99acbe03','APPROVE',None,'TRADITIONAL_NARRATIVE','64','1.64.11–17','The narrative expressly treats anger as undoing ascetic merit.'),
 ('a14fa6d2','APPROVE',None,'TRADITIONAL_NARRATIVE','64','1.64.11–17','Anger and subsequent renewed discipline are explicit.'),
 ('be9c9822','REVISE AND APPROVE','Bala Kanda 1.64 narrates Vishvamitra cursing Rambha, regretting his anger, and resolving not to succumb to anger again.','TRADITIONAL_NARRATIVE','64','1.64.11–17','The chapter directly supports this sequence; “narrative function” was an interpretation.'),
 ('0207c641','REVISE AND APPROVE','Rigveda 3.62.10 invokes Savitar’s divine radiance and asks that it impel our thoughts (dhiyo). The Vedic Heritage Portal places it in a Savitar section associated by seer metadata with Gathina Vishvamitra.','TEXTUAL_ASSERTION','3.62','3.62.10, portal lines 414, 427','The Sanskrit directly supports Savitar and dhiyo; “central spiritual-intellectual motif” was interpretive.'),
 ('78d42ac5','APPROVE',None,'MODERN_ACCESS','3.62','3.62.10, portal lines 407–409, 427','The portal supplies the verse and a recitation-video link; the claim confines relevance to access.'),
 ('9ea370a1','APPROVE',None,'TEXTUAL_ATTRIBUTION','3.62','3.62 seer/deity metadata, portal line 414; verse 10 line 427','Portal metadata identifies Gathina Vishvamitra and Savitar for 10–12; other verses have alternatives.'),
]

def claim_id(prefix):
    hits=[cid for cid in LEDGER if cid.startswith(prefix)]
    assert len(hits)==1, (prefix,hits)
    return hits[0]

def source_id(cid,url):
    m=re.search(r'### \d+\. `'+re.escape(cid)+r'`\n(.*?)(?=\n---\n|\Z)',AUDIT,re.S)
    if not m:return None
    for sid,u in re.findall(r'- Source \d+: `([0-9a-f-]+)` — (https?://\S+)',m.group(1)):
        if u==url:return sid
    return GLOBAL_SOURCE_IDS.get(url)

out=[]
for prefix,decision,wording,kind,chapter,locator,rationale in REVIEWS:
    cid=claim_id(prefix); c=LEDGER[cid]; assert c['personality']=='Vishvamitra' and not c['decision']
    url,authority=SOURCES[chapter]
    sid=source_id(cid,url)
    ref={'source_id':sid,'url':url,'locator':('Rigveda '+locator if chapter.startswith('3.') else 'Bala Kanda '+locator),'source_authority':authority,'independence_assessment':'One textual tradition. Independent historical corroboration is neither asserted nor needed for a statement explicitly about that tradition.','original_source_inspected':True,'original_claim_source_linked':sid in c['original_source_ids'] if sid else False}
    limitation=('Traditional rishi attribution and hymn text; not independent proof of single-person authorship.' if chapter.startswith('3.') else 'Epic sacred narrative; the passage does not independently establish historical biography or supernatural events.')
    out.append({'claim_id':cid,'personality':'Vishvamitra','original_claim_text':c['original_claim_text'],'decision':decision,'final_proposed_wording':wording if decision=='REVISE AND APPROVE' else (None if decision=='REMOVE FROM ACTIVE CORPUS' else c['original_claim_text']),'epistemic_type':kind,'evidence_references':[ref],'verification_rationale':rationale,'original_source_inspected':True,'material_limitation':limitation,'removal_reason':rationale if decision=='REMOVE FROM ACTIVE CORPUS' else None})
assert len(out)==len({d['claim_id'] for d in out})
(ROOT/'worker-vishvamitra-decisions.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print('decisions',len(out),'approved',sum(x['decision']=='APPROVE' for x in out),'revised',sum(x['decision']=='REVISE AND APPROVE' for x in out),'removed',sum(x['decision']=='REMOVE FROM ACTIVE CORPUS' for x in out))
