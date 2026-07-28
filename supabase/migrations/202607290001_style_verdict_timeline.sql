create table if not exists public.style_contracts (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  owner_id text not null references public.users(id) on delete cascade,
  name text not null,
  contract_text text not null,
  source_refs uuid[] not null check (cardinality(source_refs) between 5 and 10),
  extracted_at timestamptz not null default now(),
  model_used text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.style_contracts
  add column if not exists owner_id text references public.users(id) on delete cascade;
alter table public.style_contracts alter column owner_id set not null;

create unique index if not exists style_contracts_board_unique on public.style_contracts(board_id);
create index if not exists style_contracts_owner_idx on public.style_contracts(owner_id, updated_at desc);

create table if not exists public.generation_verdicts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  shot_id text not null default '',
  character_id text references public.characters(id) on delete set null,
  board_id uuid,
  prompt text not null,
  model text not null,
  params jsonb not null default '{}',
  result_asset_id uuid references public.media_assets(id) on delete set null,
  verdict text not null default 'pending' check (verdict in ('kept', 'killed', 'pending')),
  changed_variable text check (changed_variable is null or changed_variable in ('camera', 'lighting', 'speed', 'action', 'reference')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, shot_id)
);

create index if not exists generation_verdicts_board_idx on public.generation_verdicts(board_id, created_at desc);
create index if not exists generation_verdicts_character_idx on public.generation_verdicts(character_id, created_at desc);
create index if not exists generation_verdicts_asset_idx on public.generation_verdicts(result_asset_id);

alter table public.style_contracts enable row level security;
alter table public.generation_verdicts enable row level security;
revoke all on public.style_contracts from anon, authenticated;
revoke all on public.generation_verdicts from anon, authenticated;
