// Source keys, exact passage anchors, framework field, epistemic proposal, and paraphrased claim.
// Institutional accounts and scholarly readings remain attributed; no free-floating quotations are imported.
export const sources = [
  { key: "BEL", title: "Swami Vivekananda", publisher: "Belur Math, Ramakrishna Math and Ramakrishna Mission", type: "institutional", layer: "Ramakrishna Order institutional account", url: "https://belurmath.org/swami-vivekananda/" },
  { key: "CHI", title: "Paper on Hinduism", publisher: "Complete Works of Swami Vivekananda", author: "Swami Vivekananda", type: "primary_text", layer: "1893 Parliament speech", url: "https://www.ramakrishnavivekananda.info/vivekananda/volume_1/addresses_at_the_parliament/v1_c1_paper_on_hinduism.htm" },
  { key: "FIN", title: "Address at the Final Session", publisher: "Complete Works of Swami Vivekananda", author: "Swami Vivekananda", type: "primary_text", layer: "1893 Parliament speech", url: "https://www.ramakrishnavivekananda.info/vivekananda/volume_1/addresses_at_the_parliament/v1_c1_final_session.htm" },
  { key: "KAR", title: "We Help Ourselves, Not the World", publisher: "Complete Works of Swami Vivekananda", author: "Swami Vivekananda", type: "primary_text", layer: "Karma Yoga", url: "https://www.ramakrishnavivekananda.info/vivekananda/volume_1/karma-yoga/we_help_ourselves.htm" },
  { key: "PRA", title: "Practical Vedanta, Part I", publisher: "Complete Works of Swami Vivekananda", author: "Swami Vivekananda", type: "primary_text", layer: "1896 London lecture", url: "https://ramakrishnavivekananda.info/vivekananda/volume_2/practical_vedanta_and_other_lectures/practical_vedanta_part_i.htm" },
  { key: "RAJ", title: "Raja Yoga: Introductory", publisher: "Complete Works of Swami Vivekananda", author: "Swami Vivekananda", type: "primary_text", layer: "Raja Yoga", url: "https://www.ramakrishnavivekananda.info/vivekananda/volume_1/raja-yoga/introductory.htm" },
  { key: "FOU", title: "The Goal and Methods of Realisation", publisher: "Complete Works of Swami Vivekananda", author: "Swami Vivekananda", type: "primary_text", layer: "Lecture notes on four yogas", url: "https://www.ramakrishnavivekananda.info/vivekananda/volume_5/notes_from_lectures_and_discourses/the_goal_and_the_methods_of_realisation.htm" },
  { key: "PLA", title: "My Plan of Campaign", publisher: "Complete Works of Swami Vivekananda", author: "Swami Vivekananda", type: "primary_text", layer: "1897 India lecture", url: "https://www.ramakrishnavivekananda.info/vivekananda/volume_3/lectures_from_colombo_to_almora/my_plan_of_campaign.htm" },
  { key: "NEW", title: "Chicago Inter Ocean, September 21, 1893", publisher: "Chicago Inter Ocean; reproduced in Complete Works", type: "primary_text", layer: "Contemporary newspaper report", url: "https://www.ramakrishnavivekananda.info/vivekananda/volume_9/newspaper_reports/part_i_american_newspaper_reports/03_chicago_inter_ocean_sep_21_1893.htm" },
  { key: "MAS", title: "My Master", publisher: "Complete Works of Swami Vivekananda", author: "Swami Vivekananda", type: "primary_text", layer: "Vivekananda's retrospective lectures on Ramakrishna", url: "https://www.ramakrishnavivekananda.info/vivekananda/volume_4/lectures_and_discourses/my_master.htm" },
  { key: "GOS", title: "Narendra", publisher: "The Gospel of Sri Ramakrishna, introduction", type: "institutional", layer: "Disciple tradition in Nikhilananda's biographical introduction", url: "https://www.ramakrishnavivekananda.info/gospel/introduction/narendra.htm" },
  { key: "SCH", title: "Vivekananda: Cosmopolitan Vedantic Philosopher?", publisher: "Journal of World Philosophies, Indiana University", author: "A. Raghuramaraju", type: "scholarly_article", layer: "Academic review of competing interpretations", url: "https://scholarworks.iu.edu/iupjournals/index.php/jwp/article/download/6328/550/28258" },
];

export const claims = [
  ["BEL","Narendra Nath Datta","vocation","HISTORICAL_FACT","Before becoming a monk, Vivekananda was known as Narendra Nath Datta; he was born in Kolkata in 1863."],
  ["BEL","Western philosophy and history","vocation","INSTITUTIONAL_ACCOUNT","Belur Math describes Narendra's Calcutta University education as including substantial study of Western philosophy and history."],
  ["BEL","Brahmo Movement","context","INSTITUTIONAL_ACCOUNT","Belur Math records that Narendra was associated for a time with the Brahmo movement, part of his nineteenth-century religious setting."],
  ["BEL","doubts about the existence of God","lineage","INSTITUTIONAL_ACCOUNT","Belur Math recounts that Narendra questioned God's existence before meeting Ramakrishna, rather than accepting spiritual claims uncritically."],
  ["BEL","first heard about Sri Ramakrishna","lineage","INSTITUTIONAL_ACCOUNT","The Ramakrishna Order's account says a college professor first directed Narendra's attention to Ramakrishna."],
  ["BEL","have you seen God","lineage","INSTITUTIONAL_ACCOUNT","Belur Math recounts Narendra asking Ramakrishna whether he had seen God and presents Ramakrishna's response as pivotal; this is the Order's account of their relationship."],
  ["BEL","formation of the new monastic Order","lineage","INSTITUTIONAL_ACCOUNT","According to Belur Math, Ramakrishna entrusted Narendra with organizing the young disciples into a monastic order."],
  ["BEL","Baranagar","vocation","HISTORICAL_FACT","After Ramakrishna's death in 1886, Narendra and fellow disciples formed a monastic brotherhood at Baranagar."],
  ["BEL","wanderings","vocation","INSTITUTIONAL_ACCOUNT","Belur Math connects Vivekananda's travels across India with his growing concern for poverty and education."],
  ["BEL","secular knowledge","service","INSTITUTIONAL_ACCOUNT","The Order describes Vivekananda's plan for the masses as combining practical education with spiritual knowledge and self-confidence."],
  ["BEL","January 1897","context","HISTORICAL_FACT","Vivekananda returned to India in January 1897 and lectured across the country about religion and social uplift."],
  ["BEL","1 May 1897","service","HISTORICAL_FACT","Vivekananda founded the Ramakrishna Mission on 1 May 1897 to organize teaching and service by monks and lay members."],
  ["BEL","Belur","service","HISTORICAL_FACT","Vivekananda established Belur as the permanent centre for the monastic order associated with the Ramakrishna Math."],
  ["BEL","One day in November 1881","lineage","INSTITUTIONAL_ACCOUNT","Belur Math dates Narendra's meeting with Ramakrishna at Dakshineshwar to November 1881 and recounts his direct questioning of the teacher."],

  ["CHI","19th September, 1893","works","HISTORICAL_FACT","Vivekananda delivered his substantial Paper on Hinduism at the Chicago Parliament on 19 September 1893."],
  ["CHI","not in believing, but in being and becoming","teachings","PERSONALITY_STATEMENT","In his Chicago Paper on Hinduism, Vivekananda argued that religion should be realized in life rather than reduced to assent to doctrine."],
  ["CHI","each and all have a place","teachings","PERSONALITY_STATEMENT","Vivekananda presented Hindu traditions as accommodating diverse philosophical and devotional approaches, including views outside orthodox theism."],
  ["CHI","soul is divine","teachings","PERSONALITY_STATEMENT","In the Chicago paper, Vivekananda grounded spiritual freedom in an account of the divine nature of the human self."],
  ["CHI","universal religion","teachings","PERSONALITY_STATEMENT","Vivekananda's Parliament argument sought a broad religious vision while retaining the distinct paths of existing traditions."],

  ["FIN","Christian would become Hindu","teachings","PERSONALITY_STATEMENT","At the Parliament's final session, Vivekananda rejected the idea that interreligious harmony required conversion to a single faith."],
  ["FIN","assimilate the spirit of the others","teachings","PERSONALITY_STATEMENT","He urged each tradition to learn from others while preserving its own identity."],
  ["FIN","Help and not Fight","works","PERSONALITY_STATEMENT","His final Parliament address framed religious coexistence around mutual help, assimilation, and peace rather than sectarian conflict."],

  ["KAR","helping others is only helping ourselves","practice","PERSONALITY_STATEMENT","In Karma Yoga, Vivekananda treated service as a spiritual discipline that transforms the person who serves."],
  ["KAR","expect anything in return","practice","PERSONALITY_STATEMENT","Vivekananda advised doing good without seeking gratitude or reward as part of nonattachment in action."],
  ["KAR","sympathise with the weak","service","PERSONALITY_STATEMENT","His account of service joined sympathy for vulnerable people with a duty to resist hatred and fanaticism."],
  ["KAR","calmer we are","practice","PERSONALITY_STATEMENT","Vivekananda associated effective service with calm judgment, love, and self-command rather than zeal alone."],

  ["PRA","intensely practical","teachings","PERSONALITY_STATEMENT","In Practical Vedanta, Vivekananda insisted that Vedantic ideas must be applied in ordinary life."],
  ["PRA","one life throughout","teachings","PERSONALITY_STATEMENT","He used Vedanta's teaching of oneness to connect religious ideals with social and everyday conduct."],
  ["PRA","busy streets and cities","context","PERSONALITY_STATEMENT","Vivekananda argued that Vedantic insight belonged in active public life, not only in retreat or contemplation."],

  ["RAJ","All our knowledge is based upon experience","practice","PERSONALITY_STATEMENT","Raja Yoga presents direct experience and disciplined inquiry as central to religious understanding."],
  ["RAJ","observing the internal states","practice","PERSONALITY_STATEMENT","Vivekananda described Raja Yoga as a method for observing and training the mind."],
  ["RAJ","instrument is the mind itself","practice","PERSONALITY_STATEMENT","He proposed attention and introspection as tools for studying inner experience."],
  ["RAJ","secret and mysterious","complexity","PERSONALITY_STATEMENT","Vivekananda criticized secrecy and mystery-mongering around yoga, urging open rational examination."],

  ["FOU","Karma-Yoga","practice","PERSONALITY_STATEMENT","Vivekananda distinguished four major yoga paths: work, devotion, mental discipline, and knowledge."],
  ["FOU","different natures and temperaments","teachings","PERSONALITY_STATEMENT","He taught that spiritual methods should suit differing human temperaments rather than be forced into one form."],
  ["FOU","varieties of religious belief","teachings","PERSONALITY_STATEMENT","Vivekananda treated religious variety as potentially valuable when it encourages sincere spiritual life."],

  ["PLA","man-making education","service","PERSONALITY_STATEMENT","In his India lectures, Vivekananda called for education that builds capacity and character."],
  ["PLA","uplift the masses","service","PERSONALITY_STATEMENT","Vivekananda linked national renewal to educating and uplifting ordinary people, not only elites."],
  ["PLA","message from India to the West","context","PERSONALITY_STATEMENT","Vivekananda described his Western lectures as carrying a message from India to American and English audiences."],

  ["NEW","outburst of applause","context","CONTEMPORARY_REPORT","A contemporary Chicago newspaper described strong audience applause for Vivekananda at the Parliament; this records reception, not a full assessment of his influence."],
  ["NEW","appeasing hunger","service","CONTEMPORARY_REPORT","The Chicago Inter Ocean reported Vivekananda criticizing religious mission work that neglected hunger and material need."],

  ["MAS","I owe it to my Master","lineage","PERSONALITY_STATEMENT","Vivekananda credited Ramakrishna for the spiritual truth in his later public teaching, while claiming responsibility for his own errors."],
  ["MAS","My Master taught me this lesson","lineage","PERSONALITY_STATEMENT","Looking back, Vivekananda said Ramakrishna taught him that character and personal realization must precede effective spiritual teaching."],
  ["MAS","sympathy for all sects","teachings","PERSONALITY_STATEMENT","Vivekananda portrayed Ramakrishna's sympathy across religious sects as an influence on his own teaching of religious harmony."],
  ["MAS","give up for the sake of your fellow-beings","service","PERSONALITY_STATEMENT","Vivekananda described Ramakrishna's message as joining spiritual realization with concrete service to others."],

  ["GOS","first time he had ever heard a man saying that he had seen God","lineage","DISCIPLE_TESTIMONY","The Gospel's biographical introduction says Narendra was struck by Ramakrishna's claim of direct experience of God, a claim reported within the disciple tradition."],
  ["GOS","returned home rather puzzled in mind","lineage","DISCIPLE_TESTIMONY","The same account portrays Narendra as initially skeptical and puzzled by Ramakrishna despite being impressed by his sincerity."],

  ["SCH","two prevailing interpretations","complexity","SCHOLARLY_INTERPRETATION","Raghuramaraju describes a scholarly dispute between readings of Vivekananda as a direct heir of classical Advaita and as a Western-influenced neo-Vedantin."],
  ["SCH","central role in Vivekananda's intellectual and spiritual development","lineage","SCHOLARLY_INTERPRETATION","The reviewed scholarship emphasizes Ramakrishna's intellectual and spiritual influence on Vivekananda, beyond a simple guru biography."],
  ["SCH","vacillation between Advaitic inclusivism","complexity","SCHOLARLY_INTERPRETATION","The review notes tension between hierarchical and more pluralist strands in Vivekananda's presentations of religions; scholars interpret their development differently."],
];
