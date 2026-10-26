"""Source-inspected decisions for worker-modern, separate from coordinator ledger."""
import json
from pathlib import Path

base = Path('artifacts/corpus-verification')
rows = {r['claim_id']: r for r in map(json.loads, (base/'decision-ledger.jsonl').open())}

# Each item: claim prefix, decision, final wording (None means unchanged), source key,
# locator, epistemic type, reason. Source passages were independently opened live.
checks = [
('301254f3','APPROVE',None,'rma','lines 41–44','HISTORICAL_FACT','The awarding foundation explicitly lists these beneficiary categories for her concert contributions.'),
('47f14b97','APPROVE',None,'rma','lines 32–33, 40','HISTORICAL_FACT','The award citation names Hindustani and regional song repertoire and the wider audience beyond southern India.'),
('62f0166c','APPROVE',None,'rma','lines 46–52','PRIMARY_SOURCE_STATEMENT','Her award response directly credits Sadasivam; the claim properly limits this to her own account.'),
('7cedb480','APPROVE',None,'rma','lines 36–41','SCHOLARLY_ATTRIBUTION','The award citation contains precisely this musical praise and audience assessment; it is attributed to the award body.'),
('7fa33007','REVISE AND APPROVE','The Magsaysay Foundation listed performances at the Edinburgh International Music Festival and the United Nations among Subbulakshmi’s appearances abroad.','rma','lines 40–41','HISTORICAL_FACT','Both venues are stated. The original inference about public significance by 1974 is broader than the passage directly establishes.'),
('a31cf40f','REVISE AND APPROVE','The Magsaysay Foundation states that Subbulakshmi gave five benefit performances for the Kasturba Gandhi Memorial Fund in April 1944.','rma','lines 34, 42','HISTORICAL_FACT','The foundation gives number, date, and beneficiary; the original characterization as an early organized series is unnecessary.'),
('b531170b','APPROVE',None,'rma','lines 42–44','HISTORICAL_FACT','The foundation’s award citation explicitly recognizes devotional song and support of public causes.'),
('d713e2b5','APPROVE',None,'rma','lines 49–53','PRIMARY_SOURCE_STATEMENT','Her recorded response describes devotional music and acknowledges the Sage of Kanchi as her own view.'),
('ed929c42','APPROVE',None,'rma','lines 38–39','SCHOLARLY_ATTRIBUTION','The citation ascribes these formative traits; the claim correctly frames them as the award body’s evaluation.'),
('225dcd87','APPROVE',None,'nddb','lines 266–270','HISTORICAL_FACT','NDDB directly describes Phase III dates, infrastructure, and expanded services.'),
('6550d9a8','REVISE AND APPROVE','Operation Flood began in 1970 and used village milk-producer cooperatives, urban markets and dairy services to expand milk production and marketing.','nddb','lines 237–257','HISTORICAL_FACT','The page supports launch and structure, but does not itself use the claim’s Anand-pattern formulation.'),
('7ac5f497','REVISE AND APPROVE','NDDB states Operation Flood’s three objectives as increasing milk production, augmenting rural incomes and providing reasonable prices for consumers.','nddb','lines 237–245','INSTITUTIONAL_ATTRIBUTION','The three objectives are direct; the original supply-chain dependence is analysis beyond this passage.'),
('84257218','REVISE AND APPROVE','NDDB describes village producer cooperatives as procuring milk and providing inputs and services, with management and technology made available to members.','nddb','lines 237–238','INSTITUTIONAL_ATTRIBUTION','The passage directly supports village procurement and services; higher-tier processing detail needs a separate source.'),
('a59a0330','APPROVE',None,'nddb','lines 266–270','INSTITUTIONAL_ATTRIBUTION','NDDB reports increased participation by women in Phase III; the claim explicitly avoids an unsupported equality inference.'),
('b4512f78','REVISE AND APPROVE','NDDB states that Phase I of Operation Flood (1970–80) was financed by sales of EEC skimmed milk powder and butter oil donated through the World Food Programme.','nddb','lines 252–257','HISTORICAL_FACT','The primary programme page directly supports financing and dates; the original reference to Indian infrastructure is too broad here.'),
('c47b3514','APPROVE',None,'nddb','lines 255–257','HISTORICAL_FACT','NDDB names 18 milksheds and the four metropolitan markets for Phase I.'),
('d5ca29df','APPROVE',None,'nddb','lines 260–263','INSTITUTIONAL_ATTRIBUTION','NDDB gives both figures and the claim properly identifies them as programme counts.'),
('d8de79e9','REVISE AND APPROVE','NDDB states that the National Milk Grid linked producers with urban consumers and reduced seasonal and regional price variations.','nddb','lines 233–238','INSTITUTIONAL_ATTRIBUTION','The grid and price effect are the board’s statement; the original village-market framing adds an inference.'),
('ef8e6050','REVISE AND APPROVE','NDDB reports that Phase II expanded Operation Flood from 18 to 136 milksheds and reached 290 urban markets.','nddb','lines 260–263','INSTITUTIONAL_ATTRIBUTION','Both counts are direct, while the original broader national-coverage inference is not required.'),
('66bd0a54','APPROVE',None,'visva','lines 340–342','INSTITUTIONAL_ATTRIBUTION','The university history explicitly treats music, painting and drama as part of cultivating multiple human faculties.'),
('89c8e168','REVISE AND APPROVE','Visva-Bharati’s history says Tagore’s Santiniketan school held classes outdoors under trees as part of an education linking people and nature.','visva','lines 340–342','INSTITUTIONAL_ATTRIBUTION','Outdoor classes and nature connection are direct; the contrast with rote instruction is not stated there.'),
('b21e74fa','REVISE AND APPROVE','Visva-Bharati’s history characterizes Tagore’s early Santiniketan school as a conscious departure from British-introduced education in India.','visva','lines 340–342','INSTITUTIONAL_ATTRIBUTION','The institutional characterization is direct; later adaptation and experimentation are not established on this page.'),
('b49afa73','APPROVE',None,'visva','line 340','HISTORICAL_FACT','The institution dates the formal start to December 22, 1901 and reports no more than five students.'),
('e44892a1','REVISE AND APPROVE','Tagore founded Visva-Bharati in 1921, building on his earlier Santiniketan school.','visva','lines 337–347','HISTORICAL_FACT','The institution directly dates founding and describes the earlier school as the university’s nucleus.'),
('f1c7d0fc','APPROVE',None,'visva','line 347','HISTORICAL_FACT','The institution directly states the 1951 parliamentary designation.'),
('898869f8','APPROVE',None,'tagore','lines 201–208, 227–234','PRIMARY_SOURCE_STATEMENT','In the original lecture collection Tagore criticizes nationalism as a political and commercial machine at odds with humane obligations.'),
('b02a5de3','APPROVE',None,'tagore','lines 227–234, 362–367','PRIMARY_SOURCE_STATEMENT','Tagore explicitly warns Japan against adopting Western organized nationalism and aggression.'),
('be1f3367','REVISE AND APPROVE','In Nationalism, Tagore criticized British colonial domination and suppression of Indian industry while also criticizing narrow nationalism.','tagore','lines 143–167, 527','PRIMARY_SOURCE_STATEMENT','The text explicitly criticizes colonial conduct; the original claim’s interpretation of what cannot reasonably be read from it is unnecessary.'),
('f0b7218a','APPROVE',None,'tagore','lines 425–433, 511–517','PRIMARY_SOURCE_STATEMENT','The India lecture explicitly gives the social problem priority over politics and discusses relations among communities.'),
('044ff4fd','APPROVE',None,'vivek','lines 45–49','PRIMARY_SOURCE_STATEMENT','Vivekananda’s own published Chicago paper contrasts realization with mere belief.'),
('1326cb2a','APPROVE',None,'vivek','lines 4–8','PRIMARY_SOURCE_STATEMENT','The paper itself lays out diverse schools, including Buddhist agnosticism and Jain atheism.'),
('46db9183','APPROVE',None,'vivek','lines 24–34, 45–49','PRIMARY_SOURCE_STATEMENT','The paper explicitly describes the soul as free and divine within his religious argument.'),
('4efc52f0','APPROVE',None,'vivek','lines 1–3','HISTORICAL_FACT','The edition gives the address title and delivery date.'),
('000db328','APPROVE',None,'bfi','lines 38–40','PRIMARY_SOURCE_STATEMENT','Ray explicitly says he did not formulate a moral attitude first and left conclusions to critics.'),
('239d8bad','APPROVE',None,'bfi','lines 94–97','PRIMARY_SOURCE_STATEMENT','Ray says he lost his taste for the saga after the trilogy and preferred shorter spans.'),
('6abd6700','APPROVE',None,'bfi','lines 102–113','PRIMARY_SOURCE_STATEMENT','Ray explicitly identifies folk, classical, and Western influences in these songs.'),
('8dcdae75','APPROVE',None,'bfi','lines 34–37','PRIMARY_SOURCE_STATEMENT','Ray recounts his growth in directing confidence starting with Pather Panchali.'),
('07e3d3b8','APPROVE',None,'ray','lines 3–14, 28–34','HISTORICAL_FACT','The making-of account details unsuccessful financing searches, personal borrowing, and later public support.'),
('64e952cd','APPROVE',None,'ray','lines 36–38','HISTORICAL_FACT','The account explicitly credits Ravi Shankar with composing the film music.'),
('a73ab751','APPROVE',None,'ray','lines 28–34','HISTORICAL_FACT','The account directly describes West Bengal government funding after other financing failed.'),
]
sources = {
 'rma': ('https://rmaward.asia/rmawardees/subbulakshmi-m-s/','Ramon Magsaysay Award Foundation citation and awardee response; first-hand award record'),
 'nddb': ('https://www.nddb.coop/about/genesis/flood','National Dairy Development Board programme history; issuing institution'),
 'visva': ('https://www.visvabharati.ac.in/home/history_land_page/','Visva-Bharati institutional history; founding institution'),
 'vivek': ('https://www.ramakrishnavivekananda.info/vivekananda/volume_1/addresses_at_the_parliament/v1_c1_paper_on_hinduism.htm','Ramakrishna Order edition of Vivekananda’s Chicago address; primary text edition'),
 'bfi': ('https://www.bfi.org.uk/sight-and-sound/interviews/satyajit-ray-moral-attitude','BFI / Sight and Sound edited interview compiled by Andrew Robinson from conversations with Ray'),
 'ray': ('https://satyajitray.org/making-of-pather-panchali/','SatyajitRay.org production account, using Ray recollections and editorial narration'),
 'tagore': ('https://www.gutenberg.org/files/40766/40766-h/40766-h.htm','Project Gutenberg edition of Tagore, Nationalism, 1917 original text'),
}
decisions = []
for prefix, decision, wording, source_key, locator, epistemic, rationale in checks:
    matches = [r for cid,r in rows.items() if cid.startswith(prefix)]
    assert len(matches)==1 and matches[0]['decision'] is None, prefix
    r=matches[0]
    url,authority=sources[source_key]
    decisions.append({'claim_id':r['claim_id'],'personality':r['personality'],
      'original_claim_text':r['original_claim_text'],'decision':decision,
      'final_proposed_wording':wording or r['original_claim_text'],
      'epistemic_type':{'PRIMARY_SOURCE_STATEMENT':'TEXTUAL_ASSERTION',
        'INSTITUTIONAL_ATTRIBUTION':'SCHOLARLY_ATTRIBUTION'}.get(epistemic,epistemic),
      'evidence_references':[{'url':url,'locator':locator,'source_id':r['original_source_ids'][0] if r['original_source_ids'] else None,
        'source_authority':authority+'; live passage inspected 2026-10-19',
        'independence_assessment':'Single original or institutional source. No second independent source is inferred.',
        'original_source_inspected':True}],
      'verification_rationale':rationale,'original_source_inspected':True,
      'material_limitation':'Institutional accounts and first-person recollections support the attributed or narrow claim; broader historical interpretations need independent corroboration.',
      'removal_reason':None})
(base/'worker-modern-decisions.json').write_text(json.dumps(decisions,ensure_ascii=False,indent=2)+'\n')
(base/'worker-modern-source-manifest.json').write_text(json.dumps({'source_groups_inspected':[
 {'url':u,'authority':a,'cache_policy':'locator and paraphrased assessment only; full copyrighted text not cached'} for u,a in sources.values()],
 'research_spend_usd':0,'screening_file':'worker-modern-screening.jsonl',
 'decision_file':'worker-modern-decisions.json'},indent=2)+'\n')
print(len(decisions), 'source-checked decisions')
