#!/usr/bin/env python3
"""Source-checked science decisions from inspected live institutional/primary works."""
import json
from pathlib import Path

root = Path('artifacts/corpus-verification')
ledger = {r['claim_id']: r for r in map(json.loads, (root/'decision-ledger.jsonl').open())}
url = {
 'K': 'https://presidentofindia.nic.in/dr-apj-abdul-kalam-profile',
 'M': 'https://mathshistory.st-andrews.ac.uk/Biographies/Ramanujan/',
 'H': 'https://mathshistory.st-andrews.ac.uk/RS/ramanujan_rs.pdf',
 'R': 'https://www.rri.res.in/about/overview',
 'I': 'https://iisc.ac.in/wp-content/uploads/2018/03/CV_RAMAN_AND_PHYSICS_AT_IISc.pdf',
 'Q': 'https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/questionnaire-foreign-journalist',
 'B': 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6702694/',
 'S': 'https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/address-st-aloysius-college',
 'F': 'https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/address-nation-ramparts-red-fort-new-delhi',
 'D': 'https://mathshistory.st-andrews.ac.uk/DSB/Ramanujan.pdf',
}
authority = {
 'K': 'President of India, official profile provided by the President’s Secretariat, inspected 2026-10-19',
 'M': 'MacTutor History of Mathematics, University of St Andrews, J. J. O’Connor and E. F. Robertson, inspected 2026-10-19',
 'H': 'G. H. Hardy, 1921 Royal Society obituary; contemporary collaborator testimony and embedded Ramanujan correspondence, inspected 2026-10-19',
 'R': 'Raman Research Institute official institutional overview, inspected 2026-10-19',
 'I': 'Indian Institute of Science official institutional history leaflet, inspected 2026-10-19',
 'Q': 'A. P. J. Abdul Kalam, 2003 interview answers hosted by President of India, first-person primary testimony, inspected 2026-10-19',
 'B': 'Prakash Narain Tandon, 2019 Indian Journal of Medical Research scholarly review, full text inspected 2026-10-19',
 'S': 'A. P. J. Abdul Kalam, official 28 March 2003 St Aloysius College address, inspected 2026-10-19',
 'F': 'A. P. J. Abdul Kalam, official 11 May 2007 Red Fort address, inspected 2026-10-19',
 'D': 'Øystein Ore, Complete Dictionary of Scientific Biography scholarly entry reproduced by MacTutor, inspected 2026-10-19',
}
# prefix, source key, locator, epistemic type, optional replacement, rationale, limitation
items = [
 ('1ce09b33','I','PDF p. 1, lines 26–34','HISTORICAL_FACT',None,'The IISc leaflet expressly says Raman invited Born in 1935 as Reader in Theoretical Physics.','Institutional retrospective; exact appointment paperwork not inspected.'),
 ('6ec58b8d','I','PDF p. 1, lines 19–25','HISTORICAL_FACT',None,'The IISc leaflet lists all three as Raman’s students.','The leaflet gives no dates or degree relationships.'),
 ('a5bc4238','I','PDF p. 1, lines 3–7','HISTORICAL_FACT',None,'The IISc leaflet names Raman first Indian director and dates entry to 31 March 1933.','Institutional retrospective.'),
 ('b304d59a','I','PDF p. 1, lines 3–7','HISTORICAL_FACT',None,'The IISc leaflet expressly says he established the Department of Physics in 1933.','Institutional retrospective; departmental founding records not inspected.'),
 ('0f7737cd','R','lines 15–17','HISTORICAL_FACT',None,'The institute’s official overview says it was personally funded by Raman and private donations.','The precise financing amounts and dates are not given.'),
 ('86985b26','R','lines 18–20','HISTORICAL_FACT',None,'The institute’s official overview states that Raman founded the Indian Academy of Sciences in 1934.','Institutional retrospective; Academy charter not separately inspected.'),
 ('c513228c','R','lines 15–19','HISTORICAL_FACT',None,'The institute’s overview identifies the 1948 founding after Raman’s IISc retirement.','The source presents the institute’s founding perspective.'),
 ('fc2bd190','R','lines 15–17','HISTORICAL_FACT',None,'The institute states Raman remained its director and carried on research until his death in 1970.','The source does not detail each research project.'),
 ('180328bf','Q','lines 34–43','TEXTUAL_ASSERTION',None,'Kalam directly recounts not entering the Air Force as a pilot and beginning technical work in the cited answer.','Self-report; the exact selection process is not independently reconstructed.'),
 ('1c531c7b','Q','lines 41–43','TEXTUAL_ASSERTION',None,'Kalam recounts Dhawan taking responsibility after SLV-III failure and giving team credit after success, then explicitly states the leadership lesson.','This is Kalam’s retrospective interpretation of events.'),
 ('86c3e492','Q','lines 41–43','TEXTUAL_ASSERTION',None,'Kalam directly says Dhawan appointed him project director in 1973 and describes the initial unsuccessful launch.','This is Kalam’s first-person recollection.'),
 ('cd5f243a','Q','line 41','TEXTUAL_ASSERTION',None,'Kalam lists these technical areas in his own answer.','The answer does not separate which employer was responsible for each project.'),
 ('2cb39f70','B','lines 80–84; references 3–4, lines 155–160','SCHOLARLY_INTERPRETATION',None,'Tandon explicitly recognizes Burdon-Sanderson’s earlier Dionaea research and cites his 1873 Royal Society report; Bose’s plant studies came later.','Tandon elsewhere uses broad plant-neurobiology language; this decision makes only the chronology and priority distinction.'),
 ('37f8e70b','B','abstract lines 67–70; body lines 82–86','SCHOLARLY_ATTRIBUTION',None,'Tandon says later work confirmed most observations; the claim correctly limits that to his judgment and does not endorse every Bose interpretation.','The review’s sweeping conclusion about plant nervous systems is contested; this claim carefully attributes only the review’s assessment.'),
 ('d75e4c71','B','lines 72–79','SCHOLARLY_INTERPRETATION','Tandon reports that Bose devised recording instruments to make plant responses to stimuli experimentally visible.','The review directly supports recording plant responses; the original wording about durable traces adds an unsupported characterization.','Specific instrument designs and recordings were not individually checked in Bose’s original books.'),
 ('2531ba47','S','lines 18–21','TEXTUAL_ASSERTION',None,'Kalam explicitly names classroom teachers, libraries and laboratories as sources of education.','The claim summarizes his stated educational view.'),
 ('51b623f2','S','lines 22–25','TEXTUAL_ASSERTION',None,'Kalam describes education of the younger generation as an investment for the future.','This is a normative argument in a public speech.'),
 ('ba7c9fc4','S','lines 18–20','TEXTUAL_ASSERTION','Kalam recalled study at Schwartz High School and St Joseph’s College.','The speech confirms the two institutions but does not itself establish the temporal relation to later engineering training.','This is Kalam’s retrospective recollection.'),
 ('1586e287','F','lines 20–26, 45–49','TEXTUAL_ASSERTION',None,'The speech explicitly urges national development by 2020; its future-oriented wording is an aspiration, not evidence of realization.','Contemporary outcomes are outside the claim and require a separate assessment.'),
 ('6ec6add7','F','lines 23–26','TEXTUAL_ASSERTION',None,'Kalam enumerates all five sectors in the Red Fort speech.','The five-sector agenda is a stated proposal, not an evaluation of outcomes.'),
 ('cc16e922','F','lines 27–35','TEXTUAL_ASSERTION',None,'Kalam lists a smaller rural–urban divide and access to energy, water and education as components of his 2020 vision.','The speech is evidence of a proposal, not completed development.'),
 ('0b2c7697','D','PDF p. 2, lines 57–59; compare Hardy PDF p. 15, lines 615–622','SCHOLARLY_INTERPRETATION',None,'Ore identifies the modular-equations paper’s unusually good pi approximations; Hardy independently singles out the series.','Effectiveness is an expert assessment, not a claim all approximations were original.'),
 ('26bdefd9','D','PDF pp. 1–2, lines 47–54; compare Hardy PDF p. 11, lines 434–441','SCHOLARLY_INTERPRETATION',None,'Ore directly says most notebook theorems lacked standard proofs, quoting Hardy’s assessment.','Ore relies on Hardy for this judgment; these are not independent evaluations.'),
 ('46736aad','D','PDF p. 2, lines 47–54','SCHOLARLY_ATTRIBUTION',None,'The Ore biography expressly connects limited systematic training and library access to rediscovery of existing results.','Historical explanation is Ore’s scholarly interpretation.'),
 ('4d7dbe8f','D','PDF p. 2, lines 62–68; compare MacTutor lines 78–80','HISTORICAL_FACT',None,'Ore directly identifies the Hardy–Ramanujan asymptotic formula for p(n); MacTutor corroborates.','Mathematical implications are not extended beyond the stated formula.'),
 ('4f719a7e','D','PDF p. 2, lines 62–66','HISTORICAL_FACT',None,'Ore describes Ramanujan’s work on p(n) and congruence properties.','Some conjectures were proved later; the claim says identified, not proved all.'),
 ('6a0204bb','D','PDF p. 1, lines 37–41','HISTORICAL_FACT',None,'Ore says Ramanujan’s first letter added more than one hundred theorems on several mathematical topics.','The claim calls them assertions and does not presume proof or originality for each.'),
 ('79805d3f','D','PDF p. 1, lines 42–47; compare MacTutor lines 55–64','HISTORICAL_FACT',None,'Ore gives Trinity entry in 1914 and work under Hardy and Littlewood.','Guidance is a scholarly description; collaboration was not a simple teacher-student relation.'),
 ('9a09447e','D','PDF p. 2, lines 72–75; compare MacTutor lines 71–72','HISTORICAL_FACT',None,'Ore lists both 1918 fellowships, and MacTutor gives Royal Society and Trinity dates.','Distinct election dates are omitted from the claim.'),
 ('be47b43a','D','PDF p. 2, lines 66–68','SCHOLARLY_INTERPRETATION','Ore writes that Rademacher later established an exact expression for p(n) extending the Hardy–Ramanujan work.','Ore says an exact expression; the original’s specific convergent-formula characterization is not stated here.','The mathematical form should be checked against Rademacher’s own publication before restoring greater specificity.'),
 ('d0aa1e8b','D','PDF p. 2, lines 57–60; compare Hardy PDF p. 15, lines 623–626','SCHOLARLY_INTERPRETATION',None,'Ore calls the highly composite numbers memoir important and Hardy describes its elementary analysis.','Importance is an expert evaluation.'),
 ('0ca8537d','K','lines 13–16','HISTORICAL_FACT',None,'The official profile expressly names Kalam as SLV-III project director and dates the Rohini orbit insertion to July 1980.','The institutional profile credits one leader; it does not apportion every engineering contribution.'),
 ('0fe168d7','K','lines 21–22','HISTORICAL_FACT','The President’s official profile lists Wings of Fire, India 2020, My Journey, and Ignited Minds among Kalam’s books.','The book titles are directly listed, while the original interpretive clause about linking themes is not demonstrated by this passage.','The profile provides a selected list, not a bibliography.'),
 ('1f24f631','K','line 15','HISTORICAL_FACT',None,'The official profile states birth at Rameswaram in 1931 and aeronautical engineering specialization at Madras Institute of Technology.','The profile is a retrospective institutional biography.'),
 ('4215c7e3','K','lines 3, 24','HISTORICAL_FACT',None,'The profile lists the office term and identifies him as the eleventh president.','Official office record provides direct administrative evidence.'),
 ('59e0de88','K','lines 19–20','HISTORICAL_FACT',None,'The official profile lists TIFAC and principal scientific advisor work as well as the Cabinet science advisory chair.','Broad wording omits precise tenures; the profile provides them.'),
 ('5f99454a','K','line 16','SCHOLARLY_ATTRIBUTION',None,'The President’s profile specifically credits him with the evolution of ISRO’s launch vehicle programme, particularly the PSLV configuration.','This is a credit assigned by the presidential office, not independent engineering attribution.'),
 ('a0fbf8c8','K','line 23','HISTORICAL_FACT','Kalam received the Padma Bhushan in 1981, Padma Vibhushan in 1990, and Bharat Ratna in 1997.','The profile gives all three awards with dates; the phrase about what they reflect was interpretive.','Award record is taken from an official institutional biography.'),
 ('d60c168d','K','line 21','HISTORICAL_FACT',None,'The profile dates the Anna University position to November 2001 and names its professorship.','The official profile does not specify the exact end date.'),
 ('e95fea19','K','lines 15–17','HISTORICAL_FACT',None,'The profile describes the move from roughly two decades at ISRO to chief executive of IGMDP at DRDO.','The official profile emphasizes Kalam’s leadership; team contributions are not individually assessed.'),
 ('152f4d43','M','lines 45–55; compare Hardy PDF p. 2, lines 86–95','TEXTUAL_ASSERTION',None,'MacTutor reproduces Ramanujan’s 1913 letter saying he lacked university education and was taking a new path. Hardy’s obituary reproduces the letter directly.','The letter is primary self-report; its wording should remain attributed.'),
 ('1e6631e9','M','lines 8–13, 24–26; compare Hardy PDF p. 1, lines 10–16','HISTORICAL_FACT',None,'MacTutor gives Erode birth in 1887 and childhood in Kumbakonam; Hardy’s contemporary obituary corroborates those locations.','Hardy drew some early-life details from Indian acquaintances, so the works are not wholly independent on childhood.'),
 ('1e794aaa','M','lines 37–47; compare Hardy PDF pp. 1–2, lines 43–50, 86–94','HISTORICAL_FACT',None,'MacTutor and Hardy’s obituary both describe Port Trust clerkship and concurrent mathematical work; the obituary embeds Ramanujan’s own statement.','Hardy’s obituary misdates the start of the clerkship to 1911; MacTutor says 1 March 1912. The claim does not specify the date.'),
 ('59760176','M','lines 77–82; compare Hardy PDF p. 14, lines 607–612','SCHOLARLY_INTERPRETATION',None,'MacTutor describes the unpublished notebooks and later mathematical study; Hardy’s obituary says unpublished material still awaited analysis.','Later research on notebooks is assessed from the scholarly biography, not inferred from mere survival of manuscripts.'),
 ('7387a37c','M','lines 17–24','SCHOLARLY_INTERPRETATION',None,'MacTutor explicitly identifies analytic number theory, continued fractions, and infinite series among his contributions.','The word main is an evaluative scholarly characterization.'),
 ('97b951fd','M','lines 26–29; compare Hardy PDF p. 1, lines 15–20','HISTORICAL_FACT',None,'MacTutor identifies Carr’s Synopsis as a basis of independent study; Hardy quotes a schoolfellow describing its use.','The recollection in Hardy is mediated through Seshu Aiyar, so corroboration is partly dependent.'),
 ('ad9ccf96','M','lines 35–36; compare Hardy PDF p. 2, lines 48–54','SCHOLARLY_INTERPRETATION',None,'MacTutor links the 1911 Bernoulli paper to growing recognition; Hardy confirms the publication and describes its editorial reception.','The degree of wider notice is a scholarly assessment.'),
 ('fa02e01d','M','lines 28–34; compare Hardy PDF pp. 2, 10, lines 86–95, 434–441','HISTORICAL_FACT',None,'MacTutor documents failed degree examinations and independent work; Ramanujan’s letter and Hardy’s assessment confirm limited conventional training.','Regular access to current literature cannot be precisely quantified from these sources; the claim says only that it was lacking.'),
 ('fd263fc9','M','lines 55–58; compare Hardy PDF p. 2, lines 65–75','HISTORICAL_FACT',None,'MacTutor gives a two-year 1913 scholarship; Hardy describes a two-year research studentship sponsored after mathematical advocacy.','The separate accounts agree on the award, but use different administrative terms.'),
 ('382b8752','H','PDF p. 11, lines 442–457','TEXTUAL_ASSERTION',None,'Hardy states in first person that he tried to teach Ramanujan and learned more from him.','This is Hardy’s subjective recollection and is explicitly attributed.'),
 ('6fb226a9','H','PDF p. 16, lines 669–678','TEXTUAL_ASSERTION',None,'Hardy describes numerical induction and explicitly mentions partition congruences and generalization.','Assessment of method is Hardy’s collaborator testimony.'),
 ('8fff980e','H','PDF p. 16, lines 669–678','TEXTUAL_ASSERTION',None,'Hardy singles out Ramanujan’s insight into algebraic formulae and transformations of infinite series.','Admiration is Hardy’s opinion, not an objective rank.'),
 ('9089927e','H','PDF p. 15, lines 631–640','TEXTUAL_ASSERTION',None,'Hardy praises the identities while assigning Rogers priority in this specific work.','The claim is explicitly about Hardy’s judgment.'),
 ('ed302467','H','PDF p. 16, lines 651–660','TEXTUAL_ASSERTION',None,'Hardy presents the 1729 episode as his own memory, satisfying the claim’s careful attribution.','No independent transcript of the exchange was inspected.'),
 ('ff8c6a25','H','PDF p. 4, lines 154–176; PDF p. 11, lines 434–452','TEXTUAL_ASSERTION',None,'Hardy explicitly judges several early prime-number results wrong and explains the mathematical issue.','The mathematical assessment is Hardy’s and is not extended to all Ramanujan results.'),
]

def get(prefix):
    hits=[r for cid,r in ledger.items() if cid.startswith(prefix)]
    if len(hits)!=1: raise ValueError((prefix,len(hits)))
    r=hits[0]
    if r['decision'] is not None: raise ValueError((prefix,'already decided'))
    return r

rows=[]
for prefix,key,locator,epistemic,replacement,rationale,limit in items:
    r=get(prefix)
    old=r['original_claim_text']; final=replacement or old
    source_id=(r['original_source_ids'] or [None])[0]
    # Only reuse an existing source ID if its URL is the inspected work.
    linked=next((a for a in map(json.loads,(root/'audit/ALL_CLAIMS_EVIDENCE_AUDIT.jsonl').open()) if a['claim_id']==r['claim_id']),None)
    if key == 'B' or not linked or url[key] not in linked.get('source_links',[]): source_id=None
    rows.append({
        'claim_id':r['claim_id'],'personality':r['personality'],'original_claim_text':old,
        'decision':'APPROVE' if final==old else 'REVISE AND APPROVE',
        'final_proposed_wording':final,'epistemic_type':epistemic,
        'evidence_references':[{'source_id':source_id,'url':url[key],'locator':locator,
            'source_authority':authority[key],
            'independence_assessment':'One directly inspected work; supporting contemporary or scholarly corroboration is identified in the rationale where checked. Repetition of the same underlying account is not counted as independent evidence.',
            'original_source_inspected':True}],
        'verification_rationale':rationale,'original_source_inspected':True,
        'material_limitation':limit,'removal_reason':None,
    })
out=root/'worker-science-decisions.json'
out.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
print(len(rows), 'APPROVE',sum(x['decision']=='APPROVE' for x in rows),'REVISE',sum(x['decision']=='REVISE AND APPROVE' for x in rows),out)
