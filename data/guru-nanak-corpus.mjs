// Claims are paraphrases. Their source layer is explicit so text, tradition, and scholarship do not collapse into one voice.
export const sources = [
  { key: 'KARTARPUR', title: 'Kartārpur', publisher: 'Encyclopaedia of Sikhism / Punjabi University', type: 'institutional', layer: 'Sikh historical reference work', url: 'https://eos.learnpunjabi.org/KARTARPUR.html' },
  { key: 'SANGAT', title: 'Saṅgat', publisher: 'Encyclopaedia of Sikhism / Punjabi University', type: 'institutional', layer: 'Sikh institutional-history reference work', url: 'https://eos.learnpunjabi.org/SANGAT.html' },
  { key: 'LANGAR', title: 'Gurū kā Laṅgar', publisher: 'Encyclopaedia of Sikhism / Punjabi University', type: 'institutional', layer: 'Sikh institutional-history reference work', url: 'https://eos.learnpunjabi.org/GURU%20KA%20LANGAR%20%28LIT.%2C%20LANGAR%20OR%20REFECTORY%20OF%20THE%20GURU%29.html' },
  { key: 'SGPC_PRINCIPLES', title: 'Main Principles', publisher: 'Shiromani Gurdwara Parbandhak Committee', type: 'institutional', layer: 'SGPC doctrinal overview', url: 'https://sgpc.net/sikhism/main-principles-2/' },
  { key: 'SGPC_GRANTH', title: 'Sri Guru Granth Sahib', publisher: 'Shiromani Gurdwara Parbandhak Committee', type: 'institutional', layer: 'SGPC scripture overview', url: 'https://sgpc.net/sri-guru-granth-sahib-2/' },
  { key: 'MUL', title: 'Mūl Mantra', publisher: 'Encyclopaedia of Sikhism / Punjabi University', type: 'institutional', layer: 'Sikh reference work', url: 'https://learnpunjabi.org/eos/MUL%20MANTRA.html' },
  { key: 'HUKAM', title: 'Hukam', publisher: 'Encyclopaedia of Sikhism / Punjabi University', type: 'institutional', layer: 'Sikh reference work', url: 'https://www.learnpunjabi.org/eos/HUKAM.html' },
  { key: 'JANAM', title: 'Janam Sākhī', publisher: 'Encyclopaedia of Sikhism / Punjabi University', type: 'institutional', layer: 'Sikh textual-history reference work', url: 'https://eos.learnpunjabi.org/JANAM%20SAKHI%20.html' },
  { key: 'HIST', title: 'Sikh Tradition (Historiography)', publisher: 'Encyclopaedia of Sikhism / Punjabi University', type: 'institutional', layer: 'Sikh historiography reference work', url: 'https://eos.learnpunjabi.org/SIKH%20TRADITION%20%28HISTORIOGRAPHY%29.html' },
  { key: 'MANN', title: 'The Formation of the Sikh Tradition', publisher: 'Journal of Punjab Studies, University of California, Santa Barbara', author: 'Gurinder Singh Mann', type: 'scholarly_article', layer: 'University scholarly article', url: 'https://punjab.global.ucsb.edu/sites/default/files/sitefiles/journals/volume17/JPS_17_nos_1-2_Mann.pdf' },
  { key: 'JAPJI', title: 'Japji Sahib, Ang 1', publisher: 'Sri Granth', type: 'primary_text', layer: 'Guru Granth Sahib English rendering, Mahalla 1', url: 'https://www.srigranth.org/servlet/gurbani.gurbani?Action=Page&Param=1&g=0&h=0&k=0&p=1&r=1&t=2' },
];

export const claims = [
  ['KARTARPUR','1469','vocation','HISTORICAL_FACT','Guru Nanak is conventionally dated 1469–1539; most detailed narratives of his early life and travels survive in later Sikh textual traditions.'],
  ['KARTARPUR','settled here at the end','vocation','HISTORICAL_INFERENCE','The Kartarpur reference entry identifies Kartarpur on the Ravi as the place where Guru Nanak settled after his preaching travels.'],
  ['KARTARPUR','last two decades of his life','service','HISTORICAL_INFERENCE','Kartarpur became the principal early Sikh center during Guru Nanak’s final decades, where he lived with his family and a community formed around him.'],
  ['KARTARPUR','later Gur','lineage','HISTORICAL_INFERENCE','Kartarpur is associated with Bhai Lehna’s instruction by Guru Nanak and his emergence as Guru Angad, the next Guru.'],
  ['KARTARPUR','spiritual successor','lineage','HISTORICAL_INFERENCE','The Kartarpur entry records the succession of Guru Angad in a reference account; it is central to Sikh memory of a non-hereditary line of Gurus.'],
  ['SANGAT','fellowship of the holy','service','INSTITUTIONAL_ACCOUNT','Sangat denotes fellowship in devotion and moral formation; it also became a social unit oriented to brotherhood, equality, and seva.'],
  ['SANGAT','recite his hymns','works','HISTORICAL_INFERENCE','The Sangat entry connects Guru Nanak’s travels with groups of disciples who gathered to recite his hymns.'],
  ['SANGAT','not a monastic order','practice','SCHOLARLY_INTERPRETATION','The early Kartarpur community is described as a fellowship of people in ordinary occupations rather than a monastic order, clarifying Guru Nanak’s householder-oriented vision.'],
  ['SANGAT','Mard','lineage','HISTORICAL_INFERENCE','Bhai Gurdas’s remembered list of early disciples includes Mardana, identified as a Muslim mirasi or bard; this helps explain why the Guru’s musical companionship matters in Sikh memory.'],
  ['LANGAR','without distinctions of caste or status','service','INSTITUTIONAL_ACCOUNT','The langar tradition has people sit in pangat and share food without distinction of caste or status, giving community practice a concrete egalitarian form.'],
  ['LANGAR','central place','service','HISTORICAL_INFERENCE','The reference entry places langar centrally in the Kartarpur dharamsala and connects it to Guru Nanak’s teaching and labor.'],

  ['SGPC_PRINCIPLES','forgetting God is just like death','practice','INSTITUTIONAL_ACCOUNT','The SGPC principles page summarizes remembrance of God’s Name as spiritually vital in a way it attributes to Guru Nanak.'],
  ['SGPC_PRINCIPLES','only the Holy Name is valuable','practice','INSTITUTIONAL_ACCOUNT','SGPC cites Guru Nanak to contrast lifelong book-learning without remembrance of the Name with the value of devotion; this is a critique of merely formal learning, not a rejection of learning itself.'],
  ['SGPC_PRINCIPLES','No man is born great or low','teachings','INSTITUTIONAL_ACCOUNT','SGPC’s doctrinal overview states that Sikh teaching rejects inherited spiritual rank: people are judged by thought and deed rather than pedigree.'],
  ['SGPC_PRINCIPLES','caste is of no consequence','context','INSTITUTIONAL_ACCOUNT','SGPC presents caste as religiously irrelevant before God, while historical Sikh societies still had to negotiate caste in social practice.'],

  ['SGPC_GRANTH','verses which praised God and denounced superstition and caste','works','INSTITUTIONAL_ACCOUNT','SGPC describes the Guru Granth Sahib’s compilation as privileging verses praising God and criticizing superstition and caste.'],
  ['SGPC_GRANTH','Japji, Asa-di- Var of Guru Nanak','works','INSTITUTIONAL_ACCOUNT','SGPC names Japji and Asa-di-Var as Guru Nanak compositions and Punjabi literary classics within the Guru Granth Sahib.'],
  ['SGPC_GRANTH','Formalism and ritualism of Hinduism and Islam','teachings','INSTITUTIONAL_ACCOUNT','SGPC says the Guru Granth Sahib criticizes ritualism in Hindu and Islamic settings; this should not be flattened into hostility toward either community.'],
  ['SGPC_GRANTH','language of the masses','context','INSTITUTIONAL_ACCOUNT','SGPC emphasizes that the Sikh Gurus taught in accessible vernacular forms, using a vocabulary that could draw on several religious and linguistic traditions.'],

  ['MUL','opening lines','works','HISTORICAL_FACT','The Mūl Mantra is the opening formula of the Guru Granth Sahib and recurs in whole or part at major textual openings.'],
  ['MUL','primary or fundamental formula','teachings','INSTITUTIONAL_ACCOUNT','The Punjabi University reference work calls the Mūl Mantra a foundational Sikh formula, expressing a vision of one eternal Creator beyond fear and enmity.'],
  ['MUL','God is one','teachings','TEXTUAL_ASSERTION','In the Mūl Mantra, Ik Oankar expresses the affirmation of the One; English paraphrases are interpretive renderings of a compact Punjabi/Gurmukhi formula.'],
  ['MUL','gurpras','practice','INSTITUTIONAL_ACCOUNT','The Mūl Mantra reference entry explains gurprasād as locating realization within the Guru’s grace rather than self-sufficiency.'],

  ['HUKAM','beginning','works','HISTORICAL_FACT','The concept of hukam appears at the beginning of Japji, the opening composition of the Adi Granth/Guru Granth Sahib.'],
  ['HUKAM','How is the veil of falsehood','teachings','TEXTUAL_ASSERTION','Japji asks how falsehood is overcome and answers by walking in accord with hukam; the cited formulation is an attributed scriptural teaching rather than a neutral historical report.'],
  ['HUKAM','All life','teachings','TEXTUAL_ASSERTION','The reference entry summarizes Guru Nanak’s use of hukam as a divine order governing creation and human life.'],
  ['HUKAM','not identical with it','complexity','SCHOLARLY_INTERPRETATION','The Punjabi University entry warns that terms such as command, will, or pleasure overlap with hukam but do not fully capture Guru Nanak’s technical usage.'],

  ['JANAM','traditional narratives','complexity','HISTORICAL_FACT','Janamsakhis are traditional narrative life-stories of Guru Nanak, normally organized as anecdotal episodes.'],
  ['JANAM','sixteenth and seventeenth centuries','complexity','HISTORICAL_FACT','Several Janamsakhi traditions developed and expanded in the sixteenth and seventeenth centuries, combining narrative and interpretive discourse.'],
  ['JANAM','circulated and multiplied orally','complexity','HISTORICAL_INFERENCE','The Janamsakhi entry explains that anecdotes circulated orally and were later collected in written forms, a history that cautions against treating every episode as independent documentary proof.'],
  ['JANAM','no extant','complexity','HISTORICAL_FACT','The reference entry says no extant Janamsakhi can be dated earlier than the mid-seventeenth century, though it allows that a nucleus developed earlier.'],
  ['JANAM','unanimous testimony','vocation','TRADITIONAL_NARRATIVE','Janamsakhis agree on broad biographical elements such as family and the general outline of Guru Nanak’s life, but their agreement does not turn every detail into independently verified history.'],
  ['JANAM','Miharb','complexity','HISTORICAL_FACT','The Janamsakhi corpus contains distinct textual traditions, including the Miharbān tradition, and their forms and theological emphases differ.'],

  ['HIST','not historiography in the true sense','complexity','SCHOLARLY_INTERPRETATION','The historiography entry states that Janamsakhis interweave oral tradition, myth, legend, and allegory and do not consistently distinguish fact from fiction.'],
  ['HIST','faithful record of the current Sikh religious tradition','complexity','SCHOLARLY_INTERPRETATION','The same reference work treats Janamsakhis as exceptionally valuable evidence for early Sikh religious memory even where they are not straightforward event records.'],
  ['HIST','late sixteenth','complexity','HISTORICAL_FACT','The historiography entry commonly places the Adi Sakhian and Puratan traditions in the late sixteenth century, with other major Janamsakhi traditions later.'],
  ['HIST','early Sikh historical','works','HISTORICAL_FACT','The historiography entry identifies Bhai Gurdas’s Vars as early Sikh verse of high importance for Guru Nanak’s mission and that of his successors, though comparatively sparse in biography.'],
  ['HIST','oral tradition','complexity','HISTORICAL_INFERENCE','For historical questions about travel, miracles, and encounters, the corpus should distinguish Janamsakhi memory from contemporaneous documentation and from later institutional teaching.'],

  ['MANN','home would have been a sizable establishment','service','SCHOLARLY_INTERPRETATION','Gurinder Singh Mann interprets the early Kartarpur home-community as large enough for congregational prayer, food preparation and service, and visitors.'],
  ['MANN','After the establishment of Kartarpur','vocation','SCHOLARLY_INTERPRETATION','Mann reports that the Puratan Janamsakhi narrates four long journeys after Kartarpur; this is evidence of the Puratan tradition’s itinerary, not a standalone verification of each journey.'],
  ['MANN','Sikhs in their religious life did not follow','context','SCHOLARLY_INTERPRETATION','Mann notes Puratan evidence of an early Sikh self-understanding as not simply following surrounding religious practice.'],
  ['MANN','Bedi King','context','SCHOLARLY_INTERPRETATION','Mann shows that early pothi materials portray Guru Nanak and the succession through devotional and royal idioms, illuminating later Sikh memory and institutional development.'],
  ['MANN','minting a new coin','service','SCHOLARLY_INTERPRETATION','Mann reads Bhai Gurdas’s image of a new coin and a pure Panth as a later early-Sikh articulation of the Kartarpur community’s significance.'],

  ['JAPJI','without fear sans enmity','teachings','TEXTUAL_ASSERTION','Japji’s opening attributes fearlessness and freedom from enmity to the One; these attributes anchor Sikh accounts of divine unity.'],
  ['JAPJI','unborn and self-illuminated','teachings','TEXTUAL_ASSERTION','Sri Granth’s English rendering of Japji describes the One as unborn and self-illuminated; this is a translation of the original text, not a replacement for it.'],
  ['JAPJI','Guru’s grace He is obtained','practice','TEXTUAL_ASSERTION','Japji’s opening frames realization through the Guru’s grace, joining divine devotion with a disciplined spiritual path.'],
];
