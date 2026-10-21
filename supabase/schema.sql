-- Execute only in a dedicated Painel Psico Supabase project.
-- Patient data is accessible only to the account that created it.

create extension if not exists pgcrypto;


create table if not exists public.psico_anamnese_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Nova anamnese',
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

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
  anamnese_template_id uuid references public.psico_anamnese_templates(id) on delete set null,
  conclusion text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_visited_at timestamptz
);

create table if not exists public.psico_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  patient_id uuid not null references public.psico_patients(id) on delete cascade,
  occurred_on date not null default current_date,
  duration_minutes integer not null default 60 check (duration_minutes between 0 and 1440),
  title text not null default '',
  notes text not null default '',
  custom_fields jsonb not null default '{}'::jsonb,
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

create table if not exists public.psico_session_fields (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null default 'Novo campo',
  field_type text not null default 'text' check (field_type in ('text', 'textarea', 'single', 'multiple')),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists psico_session_fields_owner_position_idx
  on public.psico_session_fields(owner_id, position, created_at);

create index if not exists psico_patients_owner_idx
  on public.psico_patients(owner_id);
create index if not exists psico_sessions_patient_idx
  on public.psico_sessions(patient_id, occurred_on);
create index if not exists psico_instruments_patient_idx
  on public.psico_instruments(patient_id);

alter table public.psico_patients enable row level security;
alter table public.psico_sessions enable row level security;
alter table public.psico_session_fields enable row level security;
alter table public.psico_instruments enable row level security;

create index if not exists psico_anamnese_templates_owner_idx
  on public.psico_anamnese_templates(owner_id, created_at);

alter table public.psico_anamnese_templates enable row level security;

create policy "Owner access anamnese templates" on public.psico_anamnese_templates
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.psico_anamnese_templates to authenticated;
revoke all on public.psico_anamnese_templates from anon;

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

create policy "Owner access session fields" on public.psico_session_fields
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

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
  public.psico_patients, public.psico_sessions, public.psico_instruments, public.psico_session_fields
  to authenticated;
revoke all on public.psico_patients, public.psico_sessions, public.psico_instruments from anon;
