-- Execute only in a dedicated Painel Psico Supabase project.
-- Patient data is accessible only to the account that created it.

create extension if not exists pgcrypto;

create table if not exists public.psico_patients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  birth_date date,
  grade text not null default '',
  school text not null default '',
  guardian text not null default '',
  requester text not null default '',
  anamnese jsonb not null default '{}'::jsonb,
  conclusion text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.psico_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  patient_id uuid not null references public.psico_patients(id) on delete cascade,
  occurred_on date not null default current_date,
  duration_minutes integer not null default 50 check (duration_minutes between 0 and 1440),
  title text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.psico_instruments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  patient_id uuid not null references public.psico_patients(id) on delete cascade,
  name text not null default '',
  category text not null default '',
  status text not null default 'Pendente'
    check (status in ('Pendente','Em andamento','Concluído')),
  scores jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists psico_patients_owner_idx
  on public.psico_patients(owner_id);
create index if not exists psico_sessions_patient_idx
  on public.psico_sessions(patient_id, occurred_on);
create index if not exists psico_instruments_patient_idx
  on public.psico_instruments(patient_id);

alter table public.psico_patients enable row level security;
alter table public.psico_sessions enable row level security;
alter table public.psico_instruments enable row level security;

create policy "Owner access patients" on public.psico_patients
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owner access sessions" on public.psico_sessions
  for all to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (select 1 from public.psico_patients p
                where p.id = patient_id and p.owner_id = (select auth.uid()))
  )
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.psico_patients p
                where p.id = patient_id and p.owner_id = (select auth.uid()))
  );

create policy "Owner access instruments" on public.psico_instruments
  for all to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (select 1 from public.psico_patients p
                where p.id = patient_id and p.owner_id = (select auth.uid()))
  )
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.psico_patients p
                where p.id = patient_id and p.owner_id = (select auth.uid()))
  );

grant select, insert, update, delete on
  public.psico_patients, public.psico_sessions, public.psico_instruments
  to authenticated;
revoke all on public.psico_patients, public.psico_sessions, public.psico_instruments from anon;
