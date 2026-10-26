BEGIN;
CREATE TABLE IF NOT EXISTS corpus_verification_audit.launch_holds (
 claim_id uuid PRIMARY KEY REFERENCES public.claims(id),
 category text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO corpus_verification_audit.launch_holds(claim_id,category) VALUES
  ('d8f9f1b9-e3ca-4ca7-afa9-06fc0feb1af3','citation_mismatch'),
  ('1e12002c-eeee-4f7d-b26c-648f36aa5a16','citation_mismatch'),
  ('5609a45d-ff75-4996-bc9f-556be05c0dba','citation_mismatch'),
  ('08cff6a7-0e1c-4a21-9b03-23087f2ea745','citation_mismatch'),
  ('0f36dc1e-79a2-465a-981b-77b75665f4d7','citation_mismatch'),
  ('2d6d5273-b58d-4fc2-977c-df009060e4bd','citation_mismatch'),
  ('4a430925-c049-4438-a455-b4c2d2c2acaf','citation_mismatch'),
  ('ecc7fc2c-617c-4f29-b365-462f1c4aa0cb','citation_mismatch'),
  ('463a43cf-ce07-4734-afd1-f82d2875592b','citation_mismatch'),
  ('6d6352c0-e4ed-4414-90a4-c290e54dfa4e','citation_mismatch'),
  ('71062ea0-f9bd-4671-9b10-a7e4027d10c6','citation_mismatch'),
  ('9a849445-4c16-4ef2-bf13-c514db5f9a9c','citation_mismatch'),
  ('d3d4217a-a201-414d-934a-6dab91650ba1','citation_mismatch'),
  ('f4e89c5c-b9bc-4327-abf5-44136177a80e','citation_mismatch'),
  ('1d81056a-92c0-4452-8cb1-ada016b09a58','citation_mismatch'),
  ('41d4823f-d7c5-4757-bde5-316192902188','citation_mismatch'),
  ('c387e462-e053-47bb-8ea0-b641a90acb46','citation_mismatch'),
  ('53c4046e-5fef-439f-b594-5f84b61f63b0','citation_mismatch'),
  ('7180fef3-c2ab-4874-9ebf-63b949cda6c2','citation_mismatch'),
  ('a4fcf4d2-e3e1-4230-bb9d-2f4770cec4b3','citation_mismatch'),
  ('ad245e15-54a5-4b4c-9032-2a28bbb95cb5','citation_mismatch'),
  ('b0d5d60d-c2dc-43f8-9fe3-34a21ce75cff','citation_mismatch'),
  ('db679fec-a8ef-41cd-a1d9-a1138b0d2d01','citation_mismatch'),
  ('e33d7beb-875d-489b-958d-ac717133982f','citation_mismatch'),
  ('e76a77c7-134b-4723-92c7-2af6224bd1b1','citation_mismatch'),
  ('0886e626-38d7-482f-bbbc-24db2fb27d60','citation_mismatch'),
  ('52dc3737-5124-467a-a553-0257baa6638e','citation_mismatch'),
  ('9dfc87bf-82fa-41a1-b230-15ed33c2e01b','citation_mismatch'),
  ('a22646cc-d3b9-4e43-924a-dfda00d10d24','citation_mismatch'),
  ('bc2dadea-f37a-41e6-96db-4b6df8faea15','citation_mismatch'),
  ('7206448f-4fc2-421f-8b88-27091022b873','citation_mismatch'),
  ('edecc47a-240e-468a-948e-b550372acee9','citation_mismatch'),
  ('5542934d-b046-424a-993c-a7105b1eb87d','citation_mismatch'),
  ('7f406348-934e-43dc-9358-49d8d0782840','citation_mismatch'),
  ('810f1e3c-feb0-442f-b298-105f04ec1b70','citation_mismatch'),
  ('84a2f266-94d2-42d5-806c-6f0cfb661e5e','citation_mismatch'),
  ('9ee5ecd9-0272-4016-b59a-3a810321d286','citation_mismatch'),
  ('fa8f0682-0bde-41da-a4e0-7d1ac942cd0d','citation_mismatch'),
  ('01474b6e-2c2f-4a8f-b529-99002a07eede','citation_mismatch'),
  ('c49dd80e-e4b1-4a56-a005-bf7df968648d','citation_mismatch'),
  ('e9171056-70a4-45f2-b42f-9d6123d49706','citation_mismatch'),
  ('3eca349c-3c0e-4a15-b17d-29366a09f33c','citation_mismatch'),
  ('aead8773-3c07-44d4-b2be-70b2e7b440d6','citation_mismatch'),
  ('05942d45-7c17-4a41-882f-364543e8aed6','citation_mismatch'),
  ('917c9de6-090a-41fb-a395-d4d7e2334eae','original_provenance'),
  ('97f0b346-8b02-4297-8b71-5765954446f0','original_provenance'),
  ('d966314a-3bbb-4e33-8806-d703f95acc35','original_provenance'),
  ('06015b7f-650f-4522-976d-43ef2fec7e7e','original_provenance'),
  ('1e2b8e30-0d45-470e-9fa1-4fd4c652cb47','original_provenance'),
  ('23be0733-87bf-4483-b320-9850b727605b','original_provenance'),
  ('2c34ef2c-b24d-405f-a625-408f57dc366e','original_provenance'),
  ('4d7839f8-7966-4f4c-b6f0-7c22a3771c2f','original_provenance'),
  ('54f22437-c791-4cbb-ba1b-d31af2814b53','original_provenance'),
  ('960e78c9-9fb2-463b-99ab-6bb3988a0ddf','original_provenance'),
  ('b358938a-3a13-4a7f-ac36-a1cd2a00bd59','original_provenance'),
  ('fd077ec7-e2c8-4b05-829f-521fb9f895ce','original_provenance'),
  ('c0e8ed43-1bfd-4bb2-81b7-492f6500fb4e','original_provenance'),
  ('2c8cdc9c-0229-4e9e-9623-31512b609a4c','original_provenance'),
  ('51c9b51f-76a0-44c1-910a-c07dfaa17c65','original_provenance'),
  ('2cb39f70-470f-4d22-918f-a9d7fb8651c0','original_provenance'),
  ('37f8e70b-3501-4b5b-baec-2b9893d50b8c','original_provenance'),
  ('d75e4c71-3df2-4cee-be37-eea309c0dd75','original_provenance'),
  ('4fe46d59-f0d6-4c9e-9cd8-e7a04fc6dc72','additional_provenance'),
  ('56d372f8-89b4-491d-8535-99e2d6e2abab','additional_provenance'),
  ('5aea2401-ccea-467f-b4fa-fc1db8d70fed','additional_provenance'),
  ('709e10d2-155a-4bd4-b9c6-a056abe759e5','additional_provenance'),
  ('a34c7f26-381e-408a-a9e5-b005a10bdf3c','additional_provenance'),
  ('b43a959b-4558-4ff1-9c5e-81e09a9a05af','additional_provenance'),
  ('e25fbaa7-23c6-4fab-b70f-3f0e1bb94fc9','additional_provenance'),
  ('ee73dc34-1a5b-45c7-8de3-62d5901b682b','additional_provenance'),
  ('1faad601-fb6e-4549-bf56-1be814ed28f3','raman_source_access'),
  ('2eaab8e3-b0d4-4b7c-9d1a-a525e0ca3ea8','raman_source_access'),
  ('30ceffee-330c-4097-945c-4802fb45ffd8','raman_source_access'),
  ('430096a3-caf5-4af2-a598-e2ec0cc13516','raman_source_access'),
  ('4ec4b5b5-201d-4aa7-b678-2f9c01b9f782','raman_source_access'),
  ('664d0df2-8216-41d3-b547-03e5593c735c','raman_source_access'),
  ('8c098e8c-0d66-414a-9f6b-286247ee4798','raman_source_access'),
  ('b1abc00d-bb85-4bf4-8084-1083ca581f0a','raman_source_access'),
  ('df52cd8d-0722-4f43-a328-5c40cbf1e8b3','raman_source_access'),
  ('dfc69a57-1a01-40db-b862-f1760c298138','raman_source_access'),
  ('ecf23f83-83d2-48a7-bd5b-10bb2cae30c6','raman_source_access'),
  ('014b091d-95cf-40dd-9561-6dbb9ecebafc','sangli_source_access'),
  ('2f0bfe8b-185d-4767-a02b-48257b44f0a6','sangli_source_access'),
  ('40ce5704-3541-41e5-a410-76a95149ba2e','sangli_source_access'),
  ('695dfff7-2972-494e-9d8c-920d0b94465f','sangli_source_access'),
  ('7e9a11cb-8ef6-4603-b199-42fa209d5887','sangli_source_access'),
  ('96f17945-8866-421d-b64c-fbb5bf2fe902','sangli_source_access'),
  ('bc711676-c31a-4bb3-991e-a3b2683295a0','sangli_source_access'),
  ('c50df3de-98f6-40d1-a5a5-7acadf5533c3','sangli_source_access'),
  ('c83306bd-a4be-4a54-942a-d796c30bb4c5','sangli_source_access'),
  ('d7952ecf-d359-4f91-8506-b76ffa2121ae','sangli_source_access'),
  ('dddcc29d-2686-4471-b82d-585b5be2985c','sangli_source_access'),
  ('e62f848e-abc8-41c5-8ab2-58148d1d4f39','sangli_source_access'),
  ('f1b5bbd2-8a63-47c0-a278-2840d6af24b1','sangli_source_access') ON CONFLICT (claim_id) DO NOTHING;
DO $$ BEGIN
 IF (SELECT count(*) FROM corpus_verification_audit.launch_holds) <> 94 OR
    EXISTS (SELECT 1 FROM public.claims c JOIN corpus_verification_audit.launch_holds h ON h.claim_id=c.id WHERE c.review_status='approved')
 THEN RAISE EXCEPTION 'launch hold baseline mismatch'; END IF;
END $$;
CREATE OR REPLACE FUNCTION corpus_verification_audit.prevent_held_claim_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, corpus_verification_audit, pg_temp AS $$ BEGIN
 IF NEW.review_status='approved' AND EXISTS
  (SELECT 1 FROM corpus_verification_audit.launch_holds WHERE claim_id=NEW.id)
 THEN RAISE EXCEPTION 'claim % has an unresolved launch hold',NEW.id; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prevent_held_claim_approval ON public.claims;
CREATE TRIGGER prevent_held_claim_approval BEFORE INSERT OR UPDATE OF review_status ON public.claims
FOR EACH ROW EXECUTE FUNCTION corpus_verification_audit.prevent_held_claim_approval();
UPDATE public.source_chunks sc SET is_active=false
WHERE EXISTS (SELECT 1 FROM public.claim_chunks cc JOIN corpus_verification_audit.launch_holds h ON h.claim_id=cc.claim_id WHERE cc.chunk_id=sc.id);
CREATE OR REPLACE FUNCTION corpus_verification_audit.prevent_held_chunk_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, corpus_verification_audit, pg_temp AS $$ BEGIN
 IF NEW.is_active AND EXISTS
  (SELECT 1 FROM public.claim_chunks cc JOIN corpus_verification_audit.launch_holds h ON h.claim_id=cc.claim_id WHERE cc.chunk_id=NEW.id)
 THEN RAISE EXCEPTION 'source chunk % is linked to an unresolved launch hold',NEW.id; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prevent_held_chunk_activation ON public.source_chunks;
CREATE TRIGGER prevent_held_chunk_activation BEFORE INSERT OR UPDATE OF is_active ON public.source_chunks
FOR EACH ROW EXECUTE FUNCTION corpus_verification_audit.prevent_held_chunk_activation();
TRUNCATE public.answer_cache,public.live_research_cache,public.web_search_cache;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.source_chunks sc JOIN public.claim_chunks cc ON cc.chunk_id=sc.id JOIN corpus_verification_audit.launch_holds h ON h.claim_id=cc.claim_id WHERE sc.is_active)
 THEN RAISE EXCEPTION 'held chunk active'; END IF;
END $$;
COMMIT;
