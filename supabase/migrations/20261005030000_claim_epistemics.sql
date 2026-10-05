-- Claim epistemics and evidence contracts. Additive only: two new tables; no existing row is changed.
-- claims.evidence_type stays as the legacy coarse label; claim_epistemics records what each claim asserts,
-- how that type was assigned, and whether the claim's evidence meets that type's contract.

create table if not exists public.claim_epistemics (
  claim_id uuid primary key references public.claims(id) on delete cascade,
  personality_id uuid not null references public.personalities(id) on delete cascade,
  epistemic_type text check (epistemic_type in ('TEXTUAL_ASSERTION', 'TRADITIONAL_NARRATIVE', 'HISTORICAL_FACT', 'HISTORICAL_INFERENCE',
    'SCHOLARLY_ATTRIBUTION', 'SCHOLARLY_INTERPRETATION', 'SYNTHETIC_INTERPRETATION', 'MODERN_RECEPTION', 'NORMATIVE_RELEVANCE', 'CONTESTED', 'METHODOLOGICAL')),
  proposed_type text not null,
  type_origin text not null check (type_origin in ('deterministic', 'human', 'mentor')),
  type_confidence numeric not null default 0,
  type_review_status text not null check (type_review_status in ('auto_assigned', 'needs_type_review', 'human_confirmed', 'human_changed', 'kept_unclassified')),
  classifier_version text not null,
  classification_signals jsonb not null default '[]'::jsonb,
  is_compound boolean not null default false,
  proposition_count integer not null default 1,
  contract_status text not null check (contract_status in ('SUPPORTED', 'PARTIALLY_SUPPORTED', 'UNSUPPORTED', 'CONTESTED_REPRESENTED',
    'INSUFFICIENT_FOR_HISTORICAL_CLAIM', 'NOT_EVIDENTIARY', 'NEEDS_TYPE_REVIEW')),
  contract_satisfied boolean,
  contract_basis text,
  contract_version text not null,
  contract_detail jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  reviewer text,
  reviewer_kind text check (reviewer_kind in ('human', 'mentor', 'ai_assisted')),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists claim_epistemics_personality_idx on public.claim_epistemics(personality_id, type_review_status, epistemic_type);
comment on table public.claim_epistemics is 'What each claim asserts (epistemic type), how it was classified, and whether its total evidence meets that type''s evidence contract. Human/mentor types are never overwritten by reassessment.';

-- Claim-to-claim disagreement; the passage-level claim_chunks.contradicts relation cannot express this.
create table if not exists public.claim_relations (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  related_claim_id uuid not null references public.claims(id) on delete cascade,
  relation text not null check (relation in ('conflicts_with', 'alternative_interpretation')),
  origin text not null check (origin in ('human', 'mentor', 'deterministic')),
  note text,
  created_at timestamptz not null default now(),
  unique (claim_id, related_claim_id, relation),
  check (claim_id <> related_claim_id)
);

alter table public.claim_epistemics enable row level security;
alter table public.claim_relations enable row level security;
