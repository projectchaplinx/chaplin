-- GPLC P1: quarantine is a durable, append-only assessment. It never changes
-- the reviewed state and never deletes or auto-rejects the underlying record.

create table if not exists public.director_quarantine_assessments (
  id bigserial primary key,
  entity_kind text not null check (entity_kind in ('evidence', 'study', 'timed-media')),
  entity_id uuid not null,
  rule_key text not null,
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(entity_kind, entity_id, rule_key)
);

create index if not exists director_quarantine_assessments_entity_idx
  on public.director_quarantine_assessments(entity_kind, entity_id, created_at desc);

alter table public.director_quarantine_assessments enable row level security;
revoke all on public.director_quarantine_assessments from anon, authenticated;

drop trigger if exists director_prevent_delete on public.director_quarantine_assessments;
create trigger director_prevent_delete before delete on public.director_quarantine_assessments
  for each row execute function public.prevent_director_entity_delete();
drop trigger if exists director_prevent_update on public.director_quarantine_assessments;
create trigger director_prevent_update before update on public.director_quarantine_assessments
  for each row execute function public.prevent_director_entity_delete();

insert into public.director_quarantine_assessments (entity_kind, entity_id, rule_key, reason, evidence)
select 'evidence', id, 'restricted-rights', 'Restricted rights basis.',
  jsonb_build_object('reuseStatus', reuse_status)
from public.director_evidence_manifests where reuse_status = 'restricted'
on conflict (entity_kind, entity_id, rule_key) do nothing;

insert into public.director_quarantine_assessments (entity_kind, entity_id, rule_key, reason, evidence)
select 'evidence', id, 'metadata-only', 'Metadata-only record; no reusable source asset.',
  jsonb_build_object('reuseStatus', reuse_status)
from public.director_evidence_manifests where reuse_status = 'metadata-only'
on conflict (entity_kind, entity_id, rule_key) do nothing;

insert into public.director_quarantine_assessments (entity_kind, entity_id, rule_key, reason, evidence)
select 'evidence', id, 'culturally-sensitive', 'Culturally sensitive material requires contextual human review.',
  jsonb_build_object('culturallySensitive', true)
from public.director_evidence_manifests where culturally_sensitive
on conflict (entity_kind, entity_id, rule_key) do nothing;

insert into public.director_quarantine_assessments (entity_kind, entity_id, rule_key, reason, evidence)
select 'evidence', manifest.id, 'duplicate-content-hash',
  'Duplicate content hash is already present in the evidence corpus.',
  jsonb_build_object('contentHash', manifest.content_hash, 'duplicateCount', duplicate.count)
from public.director_evidence_manifests manifest
join (
  select content_hash, count(*)::integer as count
  from public.director_evidence_manifests
  where content_hash is not null
  group by content_hash having count(*) > 1
) duplicate on duplicate.content_hash = manifest.content_hash
on conflict (entity_kind, entity_id, rule_key) do nothing;

