
create table if not exists public.psico_anamnese_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Nova anamnese',
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.psico_patients
  add column if not exists anamnese_template_id uuid
    references public.psico_anamnese_templates(id) on delete set null;

create index if not exists psico_anamnese_templates_owner_idx
  on public.psico_anamnese_templates(owner_id, created_at);

alter table public.psico_anamnese_templates enable row level security;

create policy "Owner access anamnese templates" on public.psico_anamnese_templates
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.psico_anamnese_templates to authenticated;
revoke all on public.psico_anamnese_templates from anon;
