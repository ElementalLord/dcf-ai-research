-- Keep a sudden burst from queuing hundreds of expensive requests at once.
insert into public.api_rate_policies(action, scope, window_seconds, max_count) values
  ('ask', 'global', 1, 5),
  ('ask', 'global', 60, 90),
  ('feedback', 'global', 1, 10),
  ('login', 'global', 1, 10),
  ('gemini', 'global', 1, 4)
on conflict (action, scope, window_seconds) do update set max_count = excluded.max_count;
