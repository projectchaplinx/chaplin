-- Item-level evidence discovered from collection and provenance sources.
-- Discovery is deliberately separate from learned studies: only a human-reviewed
-- study may enter Director Brain retrieval.

create table if not exists public.director_evidence_manifests (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.director_research_sources(id) on delete cascade,
  research_job_id uuid references public.director_research_jobs(id) on delete set null,
  kind text not null check (kind in ('collection-item', 'provenance-record')),
  provider text not null,
  external_id text not null,
  canonical_url text not null,
  record_locator text not null default '',
  title text not null,
  institution text not null,
  date_label text not null default '',
  period_start integer,
  period_end integer,
  region text not null default '',
  tags text[] not null default '{}',
  facets jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  rights_uri text,
  rights_label text not null default '',
  reuse_status text not null default 'unknown' check (reuse_status in ('unknown', 'metadata-only', 'reusable', 'restricted')),
  rights_notes text not null default '',
  culturally_sensitive boolean not null default false,
  status text not null default 'discovered' check (status in ('discovered', 'needs-review', 'eligible', 'rejected', 'archived')),
  review_notes text not null default '',
  reviewed_by text,
  reviewed_at timestamptz,
  content_hash text not null,
  accessed_at timestamptz not null default now(),
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, kind, provider, external_id)
);

create index if not exists director_evidence_manifests_review_idx
  on public.director_evidence_manifests(status, reuse_status, updated_at desc);
create index if not exists director_evidence_manifests_source_idx
  on public.director_evidence_manifests(source_id, updated_at desc);
create index if not exists director_evidence_manifests_tags_idx
  on public.director_evidence_manifests using gin(tags);

alter table public.director_evidence_manifests enable row level security;
revoke all on public.director_evidence_manifests from anon, authenticated;
