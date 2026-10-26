-- Claim-focused isolated review copy. This is not the application Supabase schema.
create table original_claims (
  claim_id uuid primary key,
  original_record jsonb not null,
  original_review_status text not null,
  original_approval_origin text not null
);

create table review_decisions (
  claim_id uuid primary key references original_claims(claim_id),
  decision text not null check (decision in ('APPROVE', 'REVISE AND APPROVE', 'REMOVE FROM ACTIVE CORPUS')),
  proposed_wording text not null,
  epistemic_type text not null,
  evidence_references jsonb not null,
  verification_rationale text not null,
  applied_at timestamptz not null default now()
);

create view final_active_claims as
select c.claim_id, d.proposed_wording as claim_text, d.epistemic_type, d.evidence_references
from original_claims c join review_decisions d using (claim_id)
where d.decision in ('APPROVE', 'REVISE AND APPROVE');

create view internal_audit_history as
select c.claim_id, c.original_record, d.decision, d.proposed_wording,
       d.evidence_references, d.verification_rationale, d.applied_at
from original_claims c left join review_decisions d using (claim_id);
