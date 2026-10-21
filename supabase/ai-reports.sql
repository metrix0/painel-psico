create table public.psico_report_settings (
  id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  settings jsonb not null default '{}' check(jsonb_typeof(settings)='object')
);
alter table public.psico_report_settings enable row level security;
create policy "Owner manages report settings" on public.psico_report_settings for all to authenticated
  using(id=(select auth.uid())) with check(id=(select auth.uid()));
grant select,insert,update,delete on public.psico_report_settings to authenticated;
revoke all on public.psico_report_settings from anon;

create table public.psico_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.psico_patients(id) on delete cascade,
  request_id uuid not null,
  status text not null check(status in ('generating','reviewing','ready','failed')),
  model text not null default 'gpt-6.1-sol',
  source_hash text not null,
  source_snapshot jsonb not null,
  document jsonb,
  validation jsonb not null default '{}',
  usage jsonb not null default '{}',
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(owner_id,request_id)
);
create index psico_reports_patient_created_idx on public.psico_reports(patient_id,created_at desc);
create index psico_reports_owner_idx on public.psico_reports(owner_id);
create unique index psico_reports_one_active_idx on public.psico_reports(patient_id)
  where status in ('generating','reviewing');
alter table public.psico_reports enable row level security;
create policy "Owner reads reports" on public.psico_reports for select to authenticated
  using(owner_id=(select auth.uid()) and exists(select 1 from public.psico_patients p where p.id=patient_id and p.owner_id=(select auth.uid())));
revoke all on public.psico_reports from anon,authenticated;
grant select on public.psico_reports to authenticated;
grant all on public.psico_reports to service_role;

create table psico_private.report_jobs (
  report_id uuid primary key references public.psico_reports(id) on delete cascade,
  state jsonb not null default '{}', lease_until timestamptz
);
alter table psico_private.report_jobs enable row level security;
revoke all on psico_private.report_jobs from public,anon,authenticated;

create function public.psico_report_source(p_patient_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'captured_at',now(), 'patient',to_jsonb(p)-'owner_id'-'last_visited_at',
 'sessions',coalesce((select jsonb_agg(to_jsonb(s)-'owner_id' order by s.occurred_on,s.created_at,s.id) from public.psico_sessions s where s.patient_id=p.id and s.owner_id=auth.uid()),'[]'::jsonb),
 'instruments',coalesce((select jsonb_agg(to_jsonb(i)-'owner_id' order by i.created_at,i.id) from public.psico_instruments i where i.patient_id=p.id and i.owner_id=auth.uid()),'[]'::jsonb),
 'forms',coalesce((select jsonb_agg(to_jsonb(f)-'owner_id'-'slug' order by f.id) from public.psico_instrument_forms f join public.psico_instruments i on i.id=f.instrument_id where i.patient_id=p.id and f.owner_id=auth.uid()),'[]'::jsonb),
 'anamnese_templates',coalesce((select jsonb_agg(to_jsonb(t)-'owner_id' order by t.id) from public.psico_anamnese_templates t where t.owner_id=auth.uid() and (t.id=p.anamnese_template_id or coalesce(p.anamnese->'template_answers','{}'::jsonb) ? t.id::text)),'[]'::jsonb),
 'instrument_templates',coalesce((select jsonb_agg(to_jsonb(t)-'owner_id' order by t.id) from public.psico_instrument_templates t where t.owner_id=auth.uid() and exists(select 1 from public.psico_instruments i where i.patient_id=p.id and i.template_id=t.id)),'[]'::jsonb),
 'session_fields',coalesce((select jsonb_agg(to_jsonb(f)-'owner_id' order by f.id) from public.psico_session_fields f where f.owner_id=auth.uid() and (not f.archived or exists(select 1 from public.psico_sessions s where s.patient_id=p.id and s.custom_fields ? f.id::text))),'[]'::jsonb),
 'settings',(select settings from public.psico_report_settings where id=auth.uid())
) from public.psico_patients p where p.id=p_patient_id and p.owner_id=auth.uid(); $$;
revoke all on function public.psico_report_source(uuid) from public,anon;
grant execute on function public.psico_report_source(uuid) to authenticated;

-- Provider credentials and job state are callable only by the server service role.
create function public.psico_report_server_key() returns text
language sql security definer set search_path='' as $$
  select decrypted_secret from vault.decrypted_secrets where name='psico_openai_api_key' limit 1;
$$;
create function public.psico_report_job_claim(p_report_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 update psico_private.report_jobs set lease_until=now()+interval '60 seconds'
 where report_id=p_report_id and (lease_until is null or lease_until<now()) returning state into result;
 return result;
end; $$;
create function public.psico_report_job_put(p_report_id uuid,p_state jsonb) returns void
language sql security definer set search_path='' as $$
 insert into psico_private.report_jobs(report_id,state,lease_until) values(p_report_id,p_state,null)
 on conflict(report_id) do update set state=excluded.state,lease_until=null;
$$;
revoke all on function public.psico_report_server_key(),public.psico_report_job_claim(uuid),public.psico_report_job_put(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.psico_report_server_key(),public.psico_report_job_claim(uuid),public.psico_report_job_put(uuid,jsonb) to service_role;
