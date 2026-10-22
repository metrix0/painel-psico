-- Add an editable receiving-session link while preserving the recorded receipt date.
-- Retains the existing instrument actions and patient/owner checks.
create or replace function psico_private.instrument_action(p_id uuid, p_action text, p_session_id uuid)
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
      if q is null or jsonb_typeof(q)<>'array' then raise exception 'Configure as perguntas do formulário antes de gerar o link.'; end if;
      -- Ignore empty draft questions without changing the template or saved instrument.
      select coalesce(jsonb_agg(entry.value order by entry.position),'[]'::jsonb) into q
        from jsonb_array_elements(q) with ordinality as entry(value,position)
        where nullif(trim(entry.value->>'label'),'') is not null;
      if jsonb_array_length(q)=0 or jsonb_array_length(q)>100 then raise exception 'Configure pelo menos uma pergunta com título antes de gerar o link.'; end if;
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
  elsif p_action in ('send','set_sent_session') then
    if p_action='send' and i.received_at is not null then raise exception 'Este instrumento já foi recebido.'; end if;
    if p_action='set_sent_session' and i.sent_at is null then raise exception 'Registre o envio antes de editar a sessão.'; end if;
    if coalesce(p_session_id, case when p_action='send' then i.session_id end) is null then raise exception 'Selecione uma sessão de envio.'; end if;
    if not exists(select 1 from public.psico_sessions s where s.id=coalesce(p_session_id,case when p_action='send' then i.session_id end)
      and s.patient_id=i.patient_id and s.owner_id=auth.uid()) then raise exception 'Selecione uma sessão deste paciente.'; end if;
    if p_action='send' then
      update public.psico_instruments set sent_at=coalesce(sent_at,now()),sent_session_id=coalesce(sent_session_id,p_session_id,session_id)
        where id=i.id returning * into i;
    else
      update public.psico_instruments set sent_session_id=p_session_id where id=i.id returning * into i;
    end if;
  elsif p_action='receive' then
    if i.sent_at is null then raise exception 'Registre o envio antes do recebimento.'; end if;
    if not exists(select 1 from public.psico_sessions s where s.id=p_session_id and s.patient_id=i.patient_id and s.owner_id=auth.uid()) then raise exception 'Selecione uma sessão deste paciente.'; end if;
    update public.psico_instruments set received_at=coalesce(received_at,now()),
      received_session_id=coalesce(received_session_id,p_session_id),status='Concluído' where id=i.id returning * into i;
  elsif p_action='set_received_session' then
    if i.received_at is null then raise exception 'Registre o recebimento antes de editar a sessão.'; end if;
    if p_session_id is null or not exists(select 1 from public.psico_sessions s where s.id=p_session_id and s.patient_id=i.patient_id and s.owner_id=auth.uid()) then raise exception 'Selecione uma sessão deste paciente.'; end if;
    update public.psico_instruments set received_session_id=p_session_id where id=i.id returning * into i;
  else raise exception 'Ação inválida.';
  end if;
  select * into f from public.psico_instrument_forms where instrument_id=i.id;
  return jsonb_build_object('instrument',to_jsonb(i),'form',case when f.id is null then null else to_jsonb(f) end);
end; $$;
