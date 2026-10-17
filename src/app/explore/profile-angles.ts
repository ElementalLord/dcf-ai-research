export type ProfileAngle = {
  lens: string;
  title: string;
  question: string;
};

// These are editorial questions for reading the source collection, not biographical claims.
export const PROFILE_ANGLES: Record<string, ProfileAngle[]> = {
  "a-p-j-abdul-kalam": [
    { lens: "educational", title: "Science education", question: "How did Kalam speak to students about scientific careers and public service?" },
    { lens: "scientific", title: "Space technology", question: "What do the launch-vehicle records show about the work behind SLV-III?" },
    { lens: "institutional", title: "Research institutions", question: "How did teams and institutions shape the projects associated with Kalam?" },
    { lens: "national", title: "Rural development", question: "How did his Vision 2020 and PURA proposals connect technology with village life?" },
    { lens: "political", title: "The presidency", question: "How did Kalam use presidential addresses to communicate his priorities?" },
  ],
  "adi-shankaracharya": [
    { lens: "philosophical", title: "Nondual philosophy", question: "Which arguments define the Advaita tradition associated with Shankaracharya?" },
    { lens: "philosophical", title: "Reading the texts", question: "How do later commentaries interpret the Upanishads and Bhagavad Gita?" },
    { lens: "educational", title: "Teaching traditions", question: "How were these ideas explained and transmitted to students?" },
    { lens: "institutional", title: "Monastic lineages", question: "What can the sources establish about institutions attributed to Shankaracharya?" },
    { lens: "historical", title: "Historical record", question: "Where do accounts of his life differ in date, place, or attribution?" },
  ],
  agastya: [
    { lens: "textual", title: "Rigvedic hymns", question: "How is Agastya represented in the hymns associated with his name?" },
    { lens: "philosophical", title: "Poetry and meaning", question: "Which ideas emerge from close readings of those difficult verses?" },
    { lens: "spiritual", title: "The sage in epic narrative", question: "How do Ramayana accounts portray Agastya?" },
    { lens: "educational", title: "Traditions of learning", question: "What roles does the sage take in stories of teaching and counsel?" },
    { lens: "historical", title: "Layers of tradition", question: "How do Vedic and later epic portrayals differ?" },
  ],
  ashoka: [
    { lens: "administrative", title: "Government through edicts", question: "What do Ashoka's inscriptions say about officials and public duties?" },
    { lens: "political", title: "Dhamma and rule", question: "How did the edicts present a ruler's responsibilities?" },
    { lens: "military", title: "War and its aftermath", question: "How do the sources connect conflict with changes in royal policy?" },
    { lens: "cultural", title: "Public communication", question: "Who could encounter the inscriptions, and how were they addressed?" },
    { lens: "architectural", title: "Inscribed places", question: "What can the locations and forms of pillars and rocks tell us?" },
  ],
  "bhagat-singh": [
    { lens: "political", title: "Revolutionary ideas", question: "How did Bhagat Singh explain the political change he sought?" },
    { lens: "historical", title: "Writing and belief", question: "What do his essays reveal about faith, reason, and argument?" },
    { lens: "leadership", title: "Prison protest", question: "How did letters and hunger-strike demands frame collective action?" },
    { lens: "national", title: "Youth and political education", question: "What did he ask young political workers to study or do?" },
    { lens: "international", title: "Public memory", question: "How has his image travelled across later political movements?" },
  ],
  "c-v-raman": [
    { lens: "scientific", title: "Light and scattering", question: "How did Raman describe the observations behind his best-known work?" },
    { lens: "scientific", title: "Experimental method", question: "What instruments and methods appear in the scientific record?" },
    { lens: "educational", title: "Teaching science", question: "How was scientific learning supported through the institutions around Raman?" },
    { lens: "institutional", title: "Research institutions", question: "How did laboratories and academies shape his work and its continuation?" },
    { lens: "national", title: "Recognition and legacy", question: "How do Nobel and Indian institutional accounts remember his research?" },
  ],
  "chhatrapati-shivaji-maharaj": [
    { lens: "administrative", title: "Building a state", question: "What do historical accounts say about governing the Maratha territory?" },
    { lens: "military", title: "Forts and campaigns", question: "How did forts shape strategy in the Deccan?" },
    { lens: "maritime", title: "Coastal power", question: "What role did the western coast play in defense and trade?" },
    { lens: "political", title: "Alliances and rivals", question: "How did relationships with neighboring powers change over time?" },
    { lens: "cultural", title: "Later interpretations", question: "How do sources distinguish the historical ruler from later public memory?" },
  ],
  "guru-nanak": [
    { lens: "spiritual", title: "Teachings in scripture", question: "What ideas can be read directly in texts attributed to Guru Nanak?" },
    { lens: "social", title: "Sangat and langar", question: "How do community practices express the tradition's social vision?" },
    { lens: "philosophical", title: "Hukam and daily life", question: "How do interpreters explain core concepts in Nanak's teachings?" },
    { lens: "institutional", title: "Kartarpur community", question: "What can the sources say about the early community at Kartarpur?" },
    { lens: "historical", title: "Biography and tradition", question: "How should later Janam Sakhi stories be read alongside earlier material?" },
  ],
  "j-r-d-tata": [
    { lens: "technological", title: "Civil aviation", question: "How did aviation records describe Tata's role in early Indian flight?" },
    { lens: "economic", title: "Industrial leadership", question: "How did the Tata group change across the decades of his leadership?" },
    { lens: "institutional", title: "Research and enterprise", question: "Which enduring institutions appear in accounts of his work?" },
    { lens: "social", title: "Philanthropy and labor", question: "How did business decisions intersect with social responsibilities?" },
    { lens: "leadership", title: "Management style", question: "What do archives and timelines reveal about his approach to leading people?" },
  ],
  "jagadish-chandra-bose": [
    { lens: "scientific", title: "Radio and microwaves", question: "What do scientific accounts show about Bose's early electromagnetic experiments?" },
    { lens: "scientific", title: "Plant responses", question: "How were the plant experiments designed and interpreted?" },
    { lens: "educational", title: "Crossing disciplines", question: "How did his work connect physics, physiology, and teaching?" },
    { lens: "institutional", title: "Bose Institute", question: "What role did the institute play in continuing his research program?" },
    { lens: "national", title: "Scientific recognition", question: "How have later historians assessed his place in the history of science?" },
  ],
  "jamsetji-tata": [
    { lens: "economic", title: "Industrial ventures", question: "What do the archives show about mills, trade, and industrial planning?" },
    { lens: "institutional", title: "Higher education", question: "How did the proposed science institution develop over time?" },
    { lens: "technological", title: "Energy and infrastructure", question: "How were power and infrastructure ideas pursued?" },
    { lens: "institutional", title: "Long-term institution building", question: "Which plans outlived their founder, and who carried them forward?" },
    { lens: "social", title: "Work and public life", question: "What social goals appear in the records of his enterprises?" },
  ],
  "m-s-subbulakshmi": [
    { lens: "artistic", title: "Voice and repertoire", question: "How do recordings and concert accounts describe her musical practice?" },
    { lens: "cultural", title: "Carnatic performance", question: "How did major music forums present her work?" },
    { lens: "gender", title: "Women on public stages", question: "What do award and conference records show about changing opportunities?" },
    { lens: "institutional", title: "Broadcast and archives", question: "How did radio and cultural institutions preserve her performances?" },
    { lens: "international", title: "Global audiences", question: "How was her music introduced beyond India?" },
  ],
  "rabindranath-tagore": [
    { lens: "literary", title: "Poetry and translation", question: "How do versions of Gitanjali change across languages and editions?" },
    { lens: "social", title: "Visva-Bharati", question: "What educational vision appears in the university's history?" },
    { lens: "political", title: "Nationalism and dissent", question: "How did Tagore write about nationalism and political conscience?" },
    { lens: "philosophical", title: "Cosmopolitan thought", question: "How did he connect local culture with wider human concerns?" },
    { lens: "cultural", title: "Archives and memory", question: "What can letters and variant texts tell us about his evolving work?" },
  ],
  "rajaraja-chola-i": [
    { lens: "administrative", title: "Royal administration", question: "What do inscriptions reveal about land, revenue, and records?" },
    { lens: "architectural", title: "Brihadisvara Temple", question: "How does the temple's architecture help explain the Chola court?" },
    { lens: "cultural", title: "Temple patronage", question: "What do foundation records show about gifts and ritual life?" },
    { lens: "maritime", title: "Overseas connections", question: "How do historians assess Chola activity across the Bay of Bengal?" },
    { lens: "political", title: "Expansion and rule", question: "How did the kingdom's reach change during this reign?" },
  ],
  "ramakrishna-paramahamsa": [
    { lens: "spiritual", title: "Spiritual practice", question: "How are Ramakrishna's practices described in the recorded conversations?" },
    { lens: "historical", title: "Recording the teachings", question: "How were conversations collected, edited, and translated?" },
    { lens: "philosophical", title: "Religious experience", question: "How do the sources explain his approach to different traditions?" },
    { lens: "social", title: "Students and visitors", question: "What do accounts show about his relationships with those who came to learn?" },
    { lens: "historical", title: "Reading biography", question: "How do contemporary records and later devotional biographies differ?" },
  ],
  "rani-lakshmibai-of-jhansi": [
    { lens: "political", title: "Jhansi and succession", question: "What documents explain the dispute over Jhansi's rule?" },
    { lens: "military", title: "The 1857 uprising", question: "How do different records recount the campaigns around Jhansi and Gwalior?" },
    { lens: "administrative", title: "Leadership under pressure", question: "What can be established about decisions made during the conflict?" },
    { lens: "cultural", title: "Colonial portrayals", question: "How did British reports frame the Rani and her actions?" },
    { lens: "cultural", title: "Later memory", question: "How has her image changed in accounts written after 1858?" },
  ],
  "satyajit-ray": [
    { lens: "artistic", title: "Filmmaking craft", question: "How did Ray combine image, sound, and performance in his films?" },
    { lens: "literary", title: "Stories and adaptation", question: "How did literary sources shape the films and other writing?" },
    { lens: "cultural", title: "Film archives", question: "What do collections and catalogues preserve about his working process?" },
    { lens: "cultural", title: "Pather Panchali", question: "How do production accounts and criticism read his first feature?" },
    { lens: "international", title: "Reception abroad", question: "How did international film institutions respond to his work?" },
  ],
  "savitribai-phule": [
    { lens: "educational", title: "Girls' education", question: "What do the sources reveal about schools and access to learning?" },
    { lens: "social", title: "Caste and equality", question: "How did educational work confront social exclusion?" },
    { lens: "literary", title: "Letters and writing", question: "What can her surviving letters and texts tell us?" },
    { lens: "institutional", title: "Building schools", question: "How were educational efforts organized and sustained?" },
    { lens: "cultural", title: "Public memory", question: "How do later institutions teach and remember her work?" },
  ],
  "srinivasa-ramanujan": [
    { lens: "scientific", title: "Mathematical ideas", question: "Which problems and results recur in accounts of Ramanujan's work?" },
    { lens: "scientific", title: "Notebooks and proofs", question: "How are his notebooks studied and checked today?" },
    { lens: "educational", title: "Paths into mathematics", question: "What do biographies say about his mathematical learning?" },
    { lens: "institutional", title: "Hardy and Cambridge", question: "How did collaboration and academic institutions affect his career?" },
    { lens: "national", title: "Later legacy", question: "How have Indian and international mathematicians revisited his work?" },
  ],
  "subhas-chandra-bose": [
    { lens: "leadership", title: "Anti-colonial leadership", question: "How did Bose describe his political aims and methods?" },
    { lens: "military", title: "Indian National Army", question: "What do archival and scholarly sources establish about the INA?" },
    { lens: "international", title: "Wartime alliances", question: "How do historians assess the choices made in an international war?" },
    { lens: "political", title: "Competing strategies", question: "Where did his approach differ from other independence leaders?" },
    { lens: "historical", title: "Postwar memory", question: "How did the INA's story shape politics after the war?" },
  ],
  "swami-vivekananda": [
    { lens: "philosophical", title: "Practical Vedanta", question: "How did Vivekananda explain Vedanta for everyday life?" },
    { lens: "educational", title: "Teaching and service", question: "What did he say about learning, self-development, and service?" },
    { lens: "institutional", title: "Organizing a mission", question: "How did his ideas develop through enduring organizations?" },
    { lens: "cultural", title: "Speaking abroad", question: "How were his addresses received in different settings?" },
    { lens: "spiritual", title: "Ramakrishna's influence", question: "How did he describe his teacher and their relationship?" },
  ],
  vasistha: [
    { lens: "textual", title: "Ramayana counsel", question: "What advice does Vasistha give in the Ramayana episodes?" },
    { lens: "philosophical", title: "Duty and judgment", question: "How do the narratives frame difficult choices and obligations?" },
    { lens: "spiritual", title: "Sage traditions", question: "How is his authority presented in different texts?" },
    { lens: "educational", title: "Teacher and court", question: "What role does he play in the education of rulers?" },
    { lens: "historical", title: "Vedic and epic layers", question: "How should portrayals from different periods be compared?" },
  ],
  "verghese-kurien": [
    { lens: "agricultural", title: "Dairy cooperatives", question: "How did the Anand model organize producers and markets?" },
    { lens: "institutional", title: "Operation Flood", question: "Which organizations and decisions made the program work at scale?" },
    { lens: "rural_development", title: "Rural livelihoods", question: "What effects do evaluations report for participating communities?" },
    { lens: "technological", title: "Dairy systems", question: "What technical and logistical problems did the movement address?" },
    { lens: "leadership", title: "Cooperative governance", question: "How did the institutions balance professional management with farmer control?" },
  ],
  vishvamitra: [
    { lens: "textual", title: "Rigvedic poetry", question: "What do hymns associated with Vishvamitra say in their own textual setting?" },
    { lens: "spiritual", title: "Transformation in epic", question: "How does the Ramayana narrate the movement from king to sage?" },
    { lens: "educational", title: "Teacher of princes", question: "What does the Bala Kanda say about his role with Rama and Lakshmana?" },
    { lens: "philosophical", title: "Austerity and power", question: "How do the narratives relate discipline, status, and authority?" },
    { lens: "historical", title: "Distinct textual layers", question: "Where do Vedic and later epic accounts diverge?" },
  ],
  yajnavalkya: [
    { lens: "philosophical", title: "Upanishadic dialogue", question: "What questions are put to Yajnavalkya in the Brihadaranyaka Upanishad?" },
    { lens: "textual", title: "Ritual texts", question: "How does the Shatapatha Brahmana present his role as a teacher?" },
    { lens: "educational", title: "Methods of teaching", question: "What do the dialogues reveal about debate and instruction?" },
    { lens: "spiritual", title: "Self and knowledge", question: "How do different passages approach knowledge of the self?" },
    { lens: "historical", title: "Attribution and commentary", question: "How do later commentators interpret the figure in earlier texts?" },
  ],
};

export function profileAngles(slug: string): ProfileAngle[] {
  return PROFILE_ANGLES[slug] ?? [];
}
