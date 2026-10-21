create table public.psico_instrument_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Novo instrumento',
  category text not null default '',
  tables jsonb not null default '[]'::jsonb check (jsonb_typeof(tables) = 'array'),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index psico_instrument_templates_owner_idx on public.psico_instrument_templates(owner_id);
alter table public.psico_instrument_templates enable row level security;
create policy "Owner access instrument templates" on public.psico_instrument_templates
  for all to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
grant select,insert,update,delete on public.psico_instrument_templates to authenticated;
revoke all on public.psico_instrument_templates from anon;

alter table public.psico_instruments
  add column template_id uuid references public.psico_instrument_templates(id) on delete restrict,
  add column session_id uuid references public.psico_sessions(id) on delete no action deferrable initially deferred,
  add column notes text not null default '',
  add column tables jsonb not null default '[]'::jsonb check (jsonb_typeof(tables) = 'array');
create index psico_instruments_session_idx on public.psico_instruments(session_id);
create index psico_instruments_template_idx on public.psico_instruments(template_id);

-- Keep the original scores as well as their readable observations.
update public.psico_instruments i set notes = coalesce((
  select string_agg(concat_ws(': ', nullif(s->>'label',''), nullif(s->>'value','')), E'\n' order by ord)
  from jsonb_array_elements(i.scores) with ordinality as x(s,ord)
  where coalesce(s->>'label','') <> '' or coalesce(s->>'value','') <> ''
), '');

create function public.psico_check_instrument_links() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' and NEW.session_id is null then
    select s.id into NEW.session_id from public.psico_sessions s
    where s.patient_id = NEW.patient_id and s.owner_id = NEW.owner_id
    order by s.created_at desc, s.id desc limit 1;
    if NEW.session_id is null then raise exception 'Crie uma sessão antes de adicionar um instrumento.'; end if;
  end if;
  if NEW.session_id is not null and not exists (
    select 1 from public.psico_sessions s where s.id = NEW.session_id
      and s.patient_id = NEW.patient_id and s.owner_id = NEW.owner_id
  ) then raise exception 'A sessão deve pertencer ao mesmo paciente.'; end if;
  if TG_OP = 'UPDATE' and OLD.session_id is not null and NEW.session_id is null then
    raise exception 'Selecione uma sessão para o instrumento.';
  end if;
  if NEW.template_id is not null and not exists (
    select 1 from public.psico_instrument_templates t where t.id = NEW.template_id and t.owner_id = NEW.owner_id
  ) then raise exception 'Modelo de instrumento inválido.'; end if;
  return NEW;
end;
$$;
revoke all on function public.psico_check_instrument_links() from public,anon,authenticated;
create trigger psico_instrument_links before insert or update on public.psico_instruments
  for each row execute function public.psico_check_instrument_links();
