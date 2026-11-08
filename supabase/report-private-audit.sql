-- Private report-generation diagnostics (applied 2026-11-08).
-- Contains potentially sensitive patient data and complete provider payloads.
-- Never expose the private schema through the Supabase Data API.
create table if not exists psico_private.report_events (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.psico_reports(id) on delete cascade,
  stage text not null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists report_events_report_time_idx
  on psico_private.report_events(report_id,created_at,id);
alter table psico_private.report_events enable row level security;
revoke all on psico_private.report_events from public,anon,authenticated;
revoke all on sequence psico_private.report_events_id_seq from public,anon,authenticated;

create or replace function public.psico_report_log_event(
  p_report_id uuid,p_stage text,p_event_type text,p_payload jsonb
) returns void
language plpgsql security definer set search_path=''
as $$
begin
  if not exists (select 1 from public.psico_reports where id=p_report_id) then
    raise exception 'Unknown report';
  end if;
  if nullif(trim(p_stage),'') is null or nullif(trim(p_event_type),'') is null then
    raise exception 'Missing event metadata';
  end if;
  insert into psico_private.report_events(report_id,stage,event_type,payload)
  values (p_report_id,p_stage,p_event_type,coalesce(p_payload,'{}'::jsonb));
end;
$$;
revoke all on function public.psico_report_log_event(uuid,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.psico_report_log_event(uuid,text,text,jsonb)
  to service_role;

-- The snapshot is stored in public.psico_reports; reports' private audit
-- records contain exact requests, full provider responses and failure details.
-- Never log Authorization headers, project keys or API credentials.
