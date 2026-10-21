alter table public.psico_instrument_templates
  add column form_questions jsonb check (form_questions is null or jsonb_typeof(form_questions) = 'array');
alter table public.psico_instruments
  add column form_questions jsonb check (form_questions is null or jsonb_typeof(form_questions) = 'array'),
  add column sent_at timestamptz,
  add column received_at timestamptz,
  add column sent_session_id uuid references public.psico_sessions(id) on delete no action deferrable initially deferred,
  add column received_session_id uuid references public.psico_sessions(id) on delete no action deferrable initially deferred;
create index psico_instruments_sent_session_idx on public.psico_instruments(sent_session_id);
create index psico_instruments_received_session_idx on public.psico_instruments(received_session_id);

create table public.psico_instrument_forms (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null unique references public.psico_instruments(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  title text not null,
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  source_session_id uuid references public.psico_sessions(id) on delete no action deferrable initially deferred,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index psico_instrument_forms_owner_idx on public.psico_instrument_forms(owner_id);
create index psico_instrument_forms_source_session_idx on public.psico_instrument_forms(source_session_id);
alter table public.psico_instrument_forms enable row level security;
create policy "Owner reads instrument forms" on public.psico_instrument_forms for select to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.psico_instrument_forms from anon,authenticated;
grant select on public.psico_instrument_forms to authenticated;

create schema if not exists psico_private;
revoke all on schema psico_private from public;
grant usage on schema psico_private to anon,authenticated;

-- Owner actions are atomic and do not allow client-supplied timestamps.
create function psico_private.instrument_action(p_id uuid, p_action text, p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.psico_instruments; f public.psico_instrument_forms; q jsonb; question jsonb; patient_name text; prefix text;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária.'; end if;
  select * into i from public.psico_instruments where id=p_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Instrumento não encontrado.'; end if;
  if p_action='generate' then
    if i.session_id is null then raise exception 'Vincule o instrumento a uma sessão.'; end if;
    select * into f from public.psico_instrument_forms where instrument_id=i.id;
    if not found then
      if i.received_at is not null then raise exception 'Este instrumento já foi recebido.'; end if;
      select coalesce(i.form_questions,t.form_questions) into q from public.psico_instrument_templates t where t.id=i.template_id and t.owner_id=auth.uid();
      q := coalesce(i.form_questions,q);
      if q is null or jsonb_array_length(q)=0 or jsonb_array_length(q)>100 then raise exception 'Configure as perguntas do formulário antes de gerar o link.'; end if;
      if (select count(distinct v->>'id') from jsonb_array_elements(q) v) <> jsonb_array_length(q) then raise exception 'Identificadores de perguntas inválidos.'; end if;
      for question in select value from jsonb_array_elements(q) loop
        if coalesce(trim(question->>'id'),'')='' or coalesce(trim(question->>'label'),'')='' or
          coalesce(question->>'field_type','') not in ('text','textarea','single','multiple') then raise exception 'Verifique o nome e o tipo das perguntas.'; end if;
        if question->>'field_type' in ('single','multiple') then
          if jsonb_typeof(question->'options') is distinct from 'array' then raise exception 'Configure as opções da pergunta.'; end if;
          if jsonb_array_length(question->'options')=0 or exists(select 1 from jsonb_array_elements(question->'options') v where jsonb_typeof(v)<>'string' or trim(v #>> '{}')='') then raise exception 'Preencha todas as opções da pergunta.'; end if;
        end if;
      end loop;
      select name into patient_name from public.psico_patients where id=i.patient_id and owner_id=auth.uid();
      prefix := trim(both '-' from regexp_replace(lower(translate(patient_name||'-'||i.name,
        'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+','-','g'));
      insert into public.psico_instrument_forms(instrument_id,owner_id,slug,title,questions,source_session_id)
      values(i.id,i.owner_id,left(prefix,120)||'-'||encode(extensions.gen_random_bytes(16),'hex'),i.name,q,i.session_id) returning * into f;
    end if;
  elsif p_action='send' then
    if i.received_at is not null then raise exception 'Este instrumento já foi recebido.'; end if;
    if i.session_id is null then raise exception 'Vincule o instrumento a uma sessão.'; end if;
    update public.psico_instruments set sent_at=coalesce(sent_at,now()),sent_session_id=coalesce(sent_session_id,session_id)
      where id=i.id returning * into i;
  elsif p_action='receive' then
    if i.sent_at is null then raise exception 'Registre o envio antes do recebimento.'; end if;
    if not exists(select 1 from public.psico_sessions s where s.id=p_session_id and s.patient_id=i.patient_id and s.owner_id=auth.uid()) then raise exception 'Selecione uma sessão deste paciente.'; end if;
    update public.psico_instruments set received_at=coalesce(received_at,now()),
      received_session_id=coalesce(received_session_id,p_session_id),status='Concluído' where id=i.id returning * into i;
  else raise exception 'Ação inválida.';
  end if;
  select * into f from public.psico_instrument_forms where instrument_id=i.id;
  return jsonb_build_object('instrument',to_jsonb(i),'form',case when f.id is null then null else to_jsonb(f) end);
end; $$;

-- A public link grants access only to its question snapshot, never to patient records or answers.
create function psico_private.read_instrument_form(p_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f public.psico_instrument_forms; received timestamptz;
begin
  if p_slug is null or length(p_slug)>180 or p_slug !~ '-[a-f0-9]{32}$' then return null; end if;
  select * into f from public.psico_instrument_forms where slug=p_slug;
  if not found then return null; end if;
  select received_at into received from public.psico_instruments where id=f.instrument_id;
  return jsonb_build_object('title',f.title,'questions',case when f.submitted_at is null and received is null then f.questions else '[]'::jsonb end,
    'submitted_at',f.submitted_at,'closed',received is not null);
end; $$;

create function psico_private.submit_instrument_form(p_slug text,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f public.psico_instrument_forms; i public.psico_instruments; question jsonb; answer jsonb; answer_key text;
begin
  if p_slug is null or length(p_slug)>180 or p_slug !~ '-[a-f0-9]{32}$' then raise exception 'Formulário não encontrado.'; end if;
  -- Lock instrument first, matching owner actions, to serialize submission and manual receipt.
  select instrument_id into f.instrument_id from public.psico_instrument_forms where slug=p_slug;
  if not found then raise exception 'Formulário não encontrado.'; end if;
  select * into i from public.psico_instruments where id=f.instrument_id for update;
  if not found then raise exception 'Formulário não encontrado.'; end if;
  select * into f from public.psico_instrument_forms where slug=p_slug for update;
  if f.submitted_at is not null then return jsonb_build_object('submitted_at',f.submitted_at,'already_submitted',true); end if;
  if i.received_at is not null then raise exception 'Este instrumento já foi recebido. O formulário está encerrado.'; end if;
  if p_answers is null or jsonb_typeof(p_answers)<>'object' or octet_length(p_answers::text)>65536 then raise exception 'Respostas inválidas ou muito extensas.'; end if;
  for answer_key in select jsonb_object_keys(p_answers) loop
    if not exists(select 1 from jsonb_array_elements(f.questions) q where q->>'id'=answer_key) then raise exception 'Pergunta desconhecida.'; end if;
  end loop;
  for question in select value from jsonb_array_elements(f.questions) loop
    answer:=p_answers->(question->>'id');
    if answer is null then continue; end if;
    if question->>'field_type' in ('text','textarea') then
      if jsonb_typeof(answer)<>'string' or length(answer #>> '{}')>10000 then raise exception 'Resposta de texto inválida.'; end if;
    elsif question->>'field_type'='single' then
      if jsonb_typeof(answer)<>'string' or not (question->'options' @> jsonb_build_array(answer)) then raise exception 'Opção inválida.'; end if;
    elsif question->>'field_type'='multiple' then
      if jsonb_typeof(answer)<>'array' then raise exception 'Seleção inválida.'; end if;
      if exists(select 1 from jsonb_array_elements(answer) v where jsonb_typeof(v)<>'string' or not (question->'options' @> jsonb_build_array(v))) then raise exception 'Opção inválida.'; end if;
    else raise exception 'Tipo de pergunta inválido.';
    end if;
  end loop;
  update public.psico_instrument_forms set answers=p_answers,submitted_at=now() where id=f.id returning * into f;
  update public.psico_instruments set sent_at=coalesce(sent_at,f.created_at),sent_session_id=coalesce(sent_session_id,f.source_session_id),
    received_at=f.submitted_at,status='Concluído' where id=i.id;
  return jsonb_build_object('submitted_at',f.submitted_at,'already_submitted',false);
end; $$;

create function public.psico_instrument_action(p_id uuid,p_action text,p_session_id uuid default null)
returns jsonb language sql security invoker set search_path = '' as $$ select psico_private.instrument_action(p_id,p_action,p_session_id); $$;
create function public.psico_read_instrument_form(p_slug text)
returns jsonb language sql security invoker set search_path = '' as $$ select psico_private.read_instrument_form(p_slug); $$;
create function public.psico_submit_instrument_form(p_slug text,p_answers jsonb)
returns jsonb language sql security invoker set search_path = '' as $$ select psico_private.submit_instrument_form(p_slug,p_answers); $$;
revoke all on function psico_private.instrument_action(uuid,text,uuid),public.psico_instrument_action(uuid,text,uuid) from public,anon,authenticated;
grant execute on function psico_private.instrument_action(uuid,text,uuid),public.psico_instrument_action(uuid,text,uuid) to authenticated;
revoke all on function psico_private.read_instrument_form(text),psico_private.submit_instrument_form(text,jsonb),
  public.psico_read_instrument_form(text),public.psico_submit_instrument_form(text,jsonb) from public,anon,authenticated;
grant execute on function psico_private.read_instrument_form(text),psico_private.submit_instrument_form(text,jsonb),
  public.psico_read_instrument_form(text),public.psico_submit_instrument_form(text,jsonb) to anon,authenticated;

alter table public.psico_instruments add constraint psico_instrument_delivery_dates check (
  (sent_at is null) = (sent_session_id is null) and
  (received_at is null or (sent_at is not null and received_at >= sent_at))
);
create function public.psico_check_delivery_sessions() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if exists(select 1 from unnest(array[NEW.sent_session_id,NEW.received_session_id]) link_id
    where link_id is not null and not exists(select 1 from public.psico_sessions s where s.id=link_id and s.patient_id=NEW.patient_id and s.owner_id=NEW.owner_id))
    then raise exception 'As sessões de envio e recebimento devem pertencer ao mesmo paciente.'; end if;
  if NEW.received_at is not null then NEW.status := 'Concluído'; end if;
  return NEW;
end; $$;
revoke all on function public.psico_check_delivery_sessions() from public,anon,authenticated;
create trigger psico_instrument_delivery_sessions before insert or update on public.psico_instruments
  for each row execute function public.psico_check_delivery_sessions();
