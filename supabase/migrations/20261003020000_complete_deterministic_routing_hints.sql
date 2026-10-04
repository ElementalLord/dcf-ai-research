-- Vocabulary belongs to the framework registry, not generic retrieval code.
with hints(code, words) as (values
  ('textual_contribution', array['rigveda','veda','mandala','hymn','sukta','verse','text','authored']),
  ('tapas_sadhana', array['tapas','austerity','meditation','sadhana','ascetic']),
  ('parampara', array['guru','disciple','lineage','gotra','father','son','teacher']),
  ('social_role', array['vasistha','rama','dasharatha','shunahshepa','relationship','king']),
  ('historical_context', array['historical','date','era','period','when']),
  ('contested', array['uncertain','contested','same figure','historicity','legend','myth']),
  ('contemporary_relevance', array['today','modern','relevance','aurobindo'])
)
update public.parameters p set routing_hints = array(
  select distinct word from unnest(coalesce(p.routing_hints, '{}'::text[]) || h.words) word order by word
) from hints h where p.code = h.code;
