-- Evidence reconciliation: why an approved claim with a located passage is not EXACT, the
-- evidence-aligned refinement proposed for review, and the reviewer's decision.
-- Additive only: one new table and one nullable lineage column.

alter table public.claims add column if not exists parent_claim_id uuid references public.claims(id) on delete set null;
create index if not exists claims_parent_claim_idx on public.claims(parent_claim_id) where parent_claim_id is not null;
comment on column public.claims.parent_claim_id is 'Atomic refinement lineage: the approved claim this claim was split or refined from. The parent is never edited automatically.';

create table if not exists public.claim_reconciliations (
  id uuid primary key default gen_random_uuid(),
  personality_id uuid not null references public.personalities(id) on delete cascade,
  claim_id uuid not null references public.claims(id) on delete cascade,
  chunk_id uuid not null references public.source_chunks(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  locator_raw text,
  locator jsonb not null default '{}'::jsonb,
  current_level text not null check (current_level in ('STRONG', 'PARTIAL', 'RELATED')),
  reasons text[] not null default '{}',
  proposal_kind text not null check (proposal_kind in ('atomic_claim', 'confirm_exact', 'none')),
  proposed_text text,
  proposal_key text not null,
  deterministic boolean not null default false,
  assessment jsonb not null default '{}'::jsonb,
  priority numeric not null default 0,
  status text not null default 'proposed' check (status in (
    'proposed', 'approved_atomic', 'confirmed_exact', 'kept_original', 'marked_interpretive', 'rejected', 'passage_non_supporting', 'duplicate')),
  candidate_claim_id uuid references public.candidate_claims(id) on delete set null,
  child_claim_id uuid references public.claims(id) on delete set null,
  duplicate_of_claim_id uuid references public.claims(id) on delete set null,
  parent_possibly_redundant boolean not null default false,
  reviewer text,
  reviewer_kind text check (reviewer_kind in ('human', 'ai_assisted')),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (claim_id, chunk_id, proposal_key)
);
create index if not exists claim_reconciliations_queue_idx on public.claim_reconciliations(personality_id, status, priority desc);
alter table public.claim_reconciliations enable row level security;
comment on table public.claim_reconciliations is 'Reviewable evidence-aligned refinements of approved claims; approval creates lineage-linked claims and never rewrites the original.';
