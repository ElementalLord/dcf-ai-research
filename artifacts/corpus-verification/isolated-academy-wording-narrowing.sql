BEGIN;
UPDATE public.claims
SET claim_text = 'Satyajit Ray received an Academy Honorary Award recognizing his filmmaking, rather than an award for an individual film.',
    approval_note = 'Citation repair: exact Academy awards-database record confirms the Honorary Award. Ceremony year omitted from this claim because its selected public citation lists the 1991 award year; Academy 1992 ceremony record remains in the audit.'
WHERE id = '61e944ef-a848-4865-b28b-7ab1b56dc7eb'
  AND review_status = 'approved';
UPDATE public.claims
SET claim_text = 'The Academy’s Honorary Award citation credited Ray with influence on filmmakers and audiences worldwide; this records the Academy’s judgment of his reception.',
    approval_note = 'Citation repair: wording narrowed to what the existing Academy awards-database citation directly supports; ceremony year retained only in audit evidence.'
WHERE id = '0d6e0dc3-6b43-453e-b1f3-8b8abf08e8ab'
  AND review_status = 'approved';
TRUNCATE public.answer_cache, public.live_research_cache, public.web_search_cache;
COMMIT;
