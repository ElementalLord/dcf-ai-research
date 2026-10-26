"""Source-checked textual decisions from Hume's Bṛhadāraṇyaka translation."""
import json
from pathlib import Path

base=Path('artifacts/corpus-verification')
ledger={r['claim_id']:r for r in map(json.loads,(base/'decision-ledger.jsonl').open())}
url='https://oll-resources.s3.us-east-2.amazonaws.com/oll3/store/titles/2058/Hume_1395_EBk_v6.0.pdf'
# prefix, section, PDF page (zero based), live text line span, type, rationale, revision
checks=[
('078cbfa2','3.1.1–2',95,'3365–3381','TRADITIONAL_NARRATIVE','The translation directly gives Janaka, the sacrifice, the thousand cows, their gold, and the subsequent challenge.',None),
('0a2a7f1f','2.4.1–3',87,'3117–3124','TRADITIONAL_NARRATIVE','The first Maitreyi conversation directly gives the wealth question, reply and request for instruction.',None),
('0cf6cd03','2.4.5',88,'3129–3150','TEXTUAL_ASSERTION','The repeated self-for-whose-sake formula and injunction to see, hear and ponder the self are in this passage.',None),
('10536bf4','4.5.1–2',128,'4456–4465','TRADITIONAL_NARRATIVE','The second Maitreyi version states the two wives and the proposed property settlement, with its own gendered characterization.',None),
('2c1da367','3.8.7–8',105,'3704–3717','TEXTUAL_ASSERTION','Gargi asks what space is woven on; the answer identifies the Imperishable and lists the negations.',None),
('2c739399','3.7.3–23',102,'3606–3679','TEXTUAL_ASSERTION','The inner-controller refrain and culminating unseen-seer formulation are explicit in the translation.',None),
('4525f85d','3.8.12',106,'3739–3742','TRADITIONAL_NARRATIVE','Gargi addresses the Brahmins with this verdict at the end of the debate.',None),
('4d0138bc','3.9.26',113,'3931–3942','TRADITIONAL_NARRATIVE','The text narrates Shakalya’s failed answer, fallen head and stolen bones; this is not independently established history.',None),
('564b9021','4.4.5',126,'4376–4386','TEXTUAL_ASSERTION','The passage explicitly links conduct, desire, resolve, action and obtained result.',None),
('7656f462','4.1.1',115,'3981–3988','TRADITIONAL_NARRATIVE','Janaka’s question and Yajnavalkya’s reply are direct dialogue in the translation.',None),
('827648c4','2.4.12–14',89,'3181–3201','TEXTUAL_ASSERTION','The salt analogy, mass of knowledge and postmortem-consciousness wording appear together. The latter is contextualized by the following duality discussion.',None),
('89771c0a','4.5.15',131,'4542–4556','TRADITIONAL_NARRATIVE','The understander question, concluding instruction to Maitreyi and departure are all in the second account.',None),
('89ab97f4','4.4.6–7',127,'4396–4404','TEXTUAL_ASSERTION','The text presents desireless release and the quoted verse on desires departing from the heart.',None),
('8bf94976','3.6',101,'3552–3581','TRADITIONAL_NARRATIVE','The successive weaving questions, warning and Gargi’s silence are direct narrative.',None),
('917dac3a','6.3.7',148,'5107–5113','TRADITIONAL_NARRATIVE','The lineage passage explicitly names Uddalaka as instructor and Vajasaneya Yajnavalkya as pupil.',None),
('91b223dc','6.5.3',155,'5355–5371','TRADITIONAL_NARRATIVE','The lineage states white sacrificial formulas from Aditya and identifies Yajnavalkya’s school; the wording should avoid inferring an independent historical transmission.','The Bṛhadāraṇyaka Upaniṣad’s closing lineage says that white sacrificial formulas from Āditya are declared by Yājñavalkya of the Vājasaneyi school; this is the text’s own account of the tradition.'),
('96c36c29','4.2.4',120,'4143–4153','TRADITIONAL_NARRATIVE','The neti-neti teaching, fearlessness declaration and king’s offer are consecutive in the dialogue.',None),
('aa0040aa','4.4.22',127,'4418–4434','TEXTUAL_ASSERTION','The passage lists Vedic recitation, rites and austerity, then connects knowing the self with mendicancy and relinquishing worldly desires.',None),
('b0a691c6','3.2.13',98,'3476–3486','TRADITIONAL_NARRATIVE','The private withdrawal and karma conclusion are narrated together.',None),
('b6320f92','3.8.1–2',105,'3683–3694','TRADITIONAL_NARRATIVE','The translation has Gargi announce two questions and use the two-arrows comparison.',None),
('c3fda81c','4.3.2–6',120,'4154–4186','TRADITIONAL_NARRATIVE','The sequence of sun, moon, fire, speech and self as light follows Janaka’s questions.',None),
]
out=[]
for prefix,section,page,span,typ,why,revision in checks:
    found=[r for k,r in ledger.items() if k.startswith(prefix)]
    assert len(found)==1 and not found[0]['decision'],prefix
    r=found[0]
    out.append({'claim_id':r['claim_id'],'personality':'Yajnavalkya',
      'original_claim_text':r['original_claim_text'],
      'decision':'REVISE AND APPROVE' if revision else 'APPROVE',
      'final_proposed_wording':revision or r['original_claim_text'],
      'epistemic_type':typ,
      'evidence_references':[{'source_id':r['original_source_ids'][0] if r['original_source_ids'] else None,
        'url':url,'locator':f'Bṛhadāraṇyaka Upaniṣad {section}, PDF p. {page+1} (zero-based {page}), text lines {span}',
        'source_authority':'Robert Ernest Hume, The Thirteen Principal Upanishads (Oxford University Press, 1921), Liberty Fund PDF; actual translated passage inspected',
        'independence_assessment':'One public-domain scholarly translation of the textual witness; confirms what this edition says, not historical occurrence or independent Sanskrit variants.',
        'original_source_inspected':True}],
      'verification_rationale':why,
      'original_source_inspected':True,
      'material_limitation':'Ancient dialogue or doctrine is classified as textual assertion or traditional narrative. The translation alone does not independently establish the narrated event as history.',
      'removal_reason':None})
(base/'worker-yajnavalkya-decisions.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
(base/'worker-yajnavalkya-holds.json').write_text(json.dumps({'source_group':url,'unresolved_claim_ids':[],
 'note':'All 21 requested claims were supported as textual or traditional claims after the indicated passages were inspected; no historical-event inference was made.'},indent=2)+'\n')
print(len(out),'decisions')
