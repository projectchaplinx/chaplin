-- Explicit lineage from an approved analytical study back to reviewed item records.
create table if not exists public.director_study_evidence_manifests (
  study_id uuid not null references public.director_scene_studies(id) on delete cascade,
  manifest_id uuid not null references public.director_evidence_manifests(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (study_id, manifest_id)
);
alter table public.director_study_evidence_manifests enable row level security;
revoke all on public.director_study_evidence_manifests from anon, authenticated;
