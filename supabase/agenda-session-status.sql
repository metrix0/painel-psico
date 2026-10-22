-- A session is only a missed visit when explicitly marked by the psychologist.
alter table public.psico_sessions
  add column if not exists attendance_status text not null default 'realizada';

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'psico_sessions_attendance_status_check'
      and conrelid = 'public.psico_sessions'::regclass
  ) then
    alter table public.psico_sessions
      add constraint psico_sessions_attendance_status_check
      check (attendance_status in ('realizada', 'faltou'));
  end if;
end $$;
