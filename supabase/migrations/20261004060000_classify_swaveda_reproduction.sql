-- Classify the admitted access copy separately from its underlying work.
-- The site states it is independent, its articles are AI drafted, and the
-- Mandala page identifies Griffith's 1896 public-domain translation.
update public.sources
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'sourceClassification', 'PRIMARY_TEXT_REPRODUCTION',
  'underlyingWork', 'Rigveda, Mandala 3',
  'translationEdition', 'Ralph T. H. Griffith, The Hymns of the Rigveda (1896)',
  'sanskritBaseEdition', 'Not identified on Swaveda source page',
  'operator', 'Independent reader; no university or institutional affiliation disclosed',
  'editorialStatus', 'Public-domain text reproduction; Swaveda articles are AI drafted and not peer reviewed',
  'verseInventory', 'Swaveda reports 617 verses, 611 aligned to Griffith English; 613 active local locators require comparison',
  'provenanceReviewedAt', '2026-10-04',
  'provenanceUrls', jsonb_build_array(
    'https://www.swaveda.com/about/',
    'https://www.swaveda.com/sources/',
    'https://www.swaveda.com/texts/rigveda/3/'
  )
)
where url = 'https://www.swaveda.com/texts/rigveda/3/'
  and approval_origin = 'verified_auto';
