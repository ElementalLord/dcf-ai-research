-- Keep Scientist routing data-driven for open-ended questions about setbacks and later influence.
update public.parameters p
set routing_hints = case p.code
  when 'persistence' then array['challenge', 'obstacle', 'hardship', 'scholarship', 'illness', 'work', 'persistence', 'career', 'learn', 'students']::text[]
  when 'impact' then array['legacy', 'later', 'research', 'recognition', 'influence', 'contribution', 'importance', 'nobel', 'spectroscopy', 'impact', 'today']::text[]
  when 'discoveries' then array['discover']::text[] || coalesce(p.routing_hints, '{}'::text[])
end
from public.categories c
where p.category_id = c.id and c.slug = 'scientist'
  and p.code in ('persistence', 'impact', 'discoveries');
