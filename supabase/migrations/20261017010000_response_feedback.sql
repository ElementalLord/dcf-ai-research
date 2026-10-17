create table public.response_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  response_id uuid not null unique,
  request_id text,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 2000),
  feedback_tags text[] not null default '{}',
  question text not null,
  answer_snapshot text not null,
  citations jsonb not null default '[]'::jsonb,
  citation_count integer not null check (citation_count >= 0),
  personality_id uuid references public.personalities(id) on delete set null,
  personality_name text not null,
  used_live_search boolean not null,
  answer_mode text not null,
  provider text,
  model text,
  constraint response_feedback_tags_valid check (feedback_tags <@ array['Inaccurate','Weak sources','Missing information','Too vague','Hard to understand','Other']::text[])
);

create index response_feedback_created_idx on public.response_feedback(created_at desc);
create index response_feedback_rating_created_idx on public.response_feedback(rating, created_at desc);
create index response_feedback_personality_idx on public.response_feedback(personality_id, created_at desc);
alter table public.response_feedback enable row level security;
-- No browser roles receive direct access. Server routes use the service role.
