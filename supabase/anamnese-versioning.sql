-- Immutable Anamnese template revisions + patient-specific historical snapshots.
alter table public.psico_anamnese_templates
  add column if not exists revision integer not null default 1
  check (revision >= 1);

create table if not exists public.psico_anamnese_template_versions (
  template_id uuid not null references public.psico_anamnese_templates(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null check (revision >= 1),
  name text not null,
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  recorded_at timestamptz not null default now(),
  primary key (template_id, revision)
);

create index if not exists psico_anamnese_template_versions_owner_idx
  on public.psico_anamnese_template_versions(owner_id, template_id, revision desc);

alter table public.psico_anamnese_template_versions enable row level security;

create policy "Owner reads anamnese template versions"
  on public.psico_anamnese_template_versions for select to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.psico_anamnese_template_versions from public, anon, authenticated;
grant select on public.psico_anamnese_template_versions to authenticated;

-- The current definitions become revision 1. Do not replace existing history.
insert into public.psico_anamnese_template_versions
  (template_id, owner_id, revision, name, questions)
select id, owner_id, revision, name, questions
from public.psico_anamnese_templates
on conflict (template_id, revision) do nothing;

create schema if not exists psico_private;

create or replace function psico_private.anamnese_revision_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.name is distinct from new.name or old.questions is distinct from new.questions then
    new.revision := old.revision + 1;
  else
    new.revision := old.revision;
  end if;
  return new;
end;
$$;

create or replace function psico_private.anamnese_record_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.name is distinct from new.name or old.questions is distinct from new.questions then
    insert into public.psico_anamnese_template_versions
      (template_id, owner_id, revision, name, questions)
    values (new.id, new.owner_id, new.revision, new.name, new.questions)
    on conflict (template_id, revision) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function psico_private.anamnese_revision_before_update() from public, anon, authenticated;
revoke all on function psico_private.anamnese_record_version() from public, anon, authenticated;

create trigger psico_anamnese_before_update_revision
before update on public.psico_anamnese_templates
for each row execute function psico_private.anamnese_revision_before_update();

create trigger psico_anamnese_after_record_version
after insert or update on public.psico_anamnese_templates
for each row execute function psico_private.anamnese_record_version();

-- Backfill every linked or previously answered model without losing any answers.
-- Original wording of already-deleted questions cannot be reconstructed; show a placeholder.
with patient_model_keys as (
  select p.id as patient_id, source.template_id
  from public.psico_patients p
  cross join lateral (
    select p.anamnese_template_id::text as template_id
    where p.anamnese_template_id is not null
    union
    select jsonb_object_keys(
      case when jsonb_typeof(p.anamnese -> 'template_answers') = 'object'
        then p.anamnese -> 'template_answers' else '{}'::jsonb end
    ) as template_id
  ) source
), patient_versions as (
  select keys.patient_id,
         jsonb_object_agg(keys.template_id,
           jsonb_build_object(
             'template_id', keys.template_id,
             'revision', coalesce(t.revision, 1),
             'name', coalesce(t.name, 'Modelo anterior'),
             'questions', coalesce(t.questions, '[]'::jsonb) ||
               coalesce((
                 select jsonb_agg(jsonb_build_object(
                   'id', ans.key,
                   'label', 'Pergunta anterior (enunciado original indisponível)',
                   'field_type', case when jsonb_typeof(ans.value) = 'array' then 'multiple' else 'text' end,
                   'options', case when jsonb_typeof(ans.value) = 'array' then ans.value else '[]'::jsonb end,
                   'historical_unknown', true
                 ))
                 from jsonb_each(
                   case when jsonb_typeof(p.anamnese -> 'template_answers' -> keys.template_id) = 'object'
                     then p.anamnese -> 'template_answers' -> keys.template_id else '{}'::jsonb end
                 ) ans
                 where not exists (
                   select 1 from jsonb_array_elements(coalesce(t.questions, '[]'::jsonb)) q
                   where q ->> 'id' = ans.key
                 )
               ), '[]'::jsonb)
           )
         ) as snapshots
  from patient_model_keys keys
  join public.psico_patients p on p.id = keys.patient_id
  left join public.psico_anamnese_templates t on t.id::text = keys.template_id and t.owner_id = p.owner_id
  group by keys.patient_id
)
update public.psico_patients p
set anamnese = jsonb_set(
  coalesce(p.anamnese, '{}'::jsonb), '{template_snapshots}',
  snapshots.snapshots ||
    (case when jsonb_typeof(p.anamnese -> 'template_snapshots') = 'object'
      then p.anamnese -> 'template_snapshots' else '{}'::jsonb end),
  true
)
from patient_versions snapshots
where p.id = snapshots.patient_id;
