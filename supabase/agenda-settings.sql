-- Working hours are private per psychologist; each integer is the start of a 1h block.
create table if not exists public.psico_agenda_settings (
  id uuid primary key references auth.users(id) on delete cascade,
  slots jsonb not null default '{"0":[8,9,10,11,13,14,15],"1":[8,9,10,11],"2":[8,9,10,11,13,14,15],"3":[8,9,10,11,13,14,15],"4":[8,9,10,11,13,14,15],"5":[8,9,10,11,13,14,15],"6":[8,9,10,11,13,14,15]}'::jsonb,
  constraint psico_agenda_settings_slots_object check (jsonb_typeof(slots) = 'object')
);

alter table public.psico_agenda_settings enable row level security;

drop policy if exists "Own agenda settings" on public.psico_agenda_settings;
create policy "Own agenda settings" on public.psico_agenda_settings
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select, insert, update, delete on public.psico_agenda_settings to authenticated;
revoke all on public.psico_agenda_settings from anon;
