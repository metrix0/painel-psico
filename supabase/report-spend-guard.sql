-- Run after supabase/ai-reports.sql. Applied to production on 2026-10-26.
-- Prevent surprise API spend by limiting paid *generation starts* across all accounts.
-- These are count caps, not dollar caps; enable a HARD USD spend limit separately in OpenAI project billing.
-- Operational kill switch: update psico_private.report_guard set enabled=false where id=1;
create table if not exists psico_private.report_guard (
  id integer primary key default 1 check (id=1),
  enabled boolean not null default true,
  owner_day_limit integer not null default 2 check(owner_day_limit between 0 and 100),
  project_day_limit integer not null default 3 check(project_day_limit between 0 and 100),
  project_month_limit integer not null default 10 check(project_month_limit between 0 and 1000),
  owner_active_limit integer not null default 1 check(owner_active_limit between 0 and 10),
  project_active_limit integer not null default 2 check(project_active_limit between 0 and 20)
);
insert into psico_private.report_guard
(id,enabled,owner_day_limit,project_day_limit,project_month_limit,owner_active_limit,project_active_limit)
values (1,true,2,3,10,1,2) on conflict (id) do nothing;
revoke all on psico_private.report_guard from public,anon,authenticated;

create or replace function psico_private.enforce_report_quota()
returns trigger language plpgsql security definer set search_path='' as $guard$
declare caps psico_private.report_guard%rowtype;
begin
  if new.status <> 'generating' then
    raise exception 'A geração precisa começar no estado generating.' using errcode='P0001';
  end if;
  -- Serializes concurrent requests across users; quota checks cannot race.
  select * into caps from psico_private.report_guard where id=1 for update;
  if not found or not caps.enabled then
    raise exception 'A geração de laudos está pausada pelo controle de gastos.' using errcode='P0001';
  end if;
  -- Recover abandoned reports without starting a new API call.
  update public.psico_reports set status='failed',
    error_message='Geração encerrada após 45 minutos. Recomece apenas se necessário.',
    completed_at=now()
  where status in ('generating','reviewing')
    and created_at < now()-interval '45 minutes';
  if (select count(*) from public.psico_reports r
      where r.owner_id=new.owner_id and r.status in ('generating','reviewing')) >= caps.owner_active_limit then
    raise exception 'Já existe um laudo em andamento nesta conta.' using errcode='P0001';
  end if;
  if (select count(*) from public.psico_reports r where r.status in ('generating','reviewing')) >= caps.project_active_limit then
    raise exception 'O limite de laudos simultâneos foi atingido.' using errcode='P0001';
  end if;
  if (select count(*) from public.psico_reports r
      where r.owner_id=new.owner_id and r.created_at>now()-interval '24 hours') >= caps.owner_day_limit then
    raise exception 'Limite de 2 novas gerações em 24 horas por conta.' using errcode='P0001';
  end if;
  if (select count(*) from public.psico_reports r
      where r.created_at>now()-interval '24 hours') >= caps.project_day_limit then
    raise exception 'Limite global de 3 novas gerações em 24 horas.' using errcode='P0001';
  end if;
  if (select count(*) from public.psico_reports r
      where r.created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC') >= caps.project_month_limit then
    raise exception 'Limite global de 10 novas gerações neste mês.' using errcode='P0001';
  end if;
  return new;
end $guard$;
revoke all on function psico_private.enforce_report_quota() from public,anon,authenticated;
drop trigger if exists psico_report_spend_guard on public.psico_reports;
create trigger psico_report_spend_guard before insert on public.psico_reports
  for each row execute function psico_private.enforce_report_quota();
