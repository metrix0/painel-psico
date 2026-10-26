import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { REPORT_MODEL, REPORT_VERSION, DEFAULT_REPORT_SETTINGS, makeSnapshot, sourceHash, documentSchema, REVIEW_SCHEMA, generationPrompt, reviewPrompt, validateReport, extractResponse } from '../_shared/reportCore.mjs';

const MAX_SNAPSHOT_BYTES=120000; // reject oversize reports rather than silently clipping clinical data
const MAX_REPORT_AGE_MS=45*60*1000; // stale jobs may not start more paid stages
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const validId=(id:unknown)=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
class SafeError extends Error { constructor(message:string,public status=400,public retryable=false){super(message);} }
const result=async(query:any)=>{const {data,error}=await query;if(error)throw new SafeError('Não foi possível acessar os registros do laudo.',500,true);return data;};
const publicReport=(report:any)=>({id:report.id,patient_id:report.patient_id,status:report.status,model:report.model,validation:report.validation,usage:report.usage,error_message:report.error_message,created_at:report.created_at,completed_at:report.completed_at});
async function api(key:string,path:string,body?:unknown,method?:string){
  let r:Response; try { r=await fetch('https://api.openai.com/v1/'+path,{method:method||(body?'POST':'GET'),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)}); } catch { throw new SafeError('A comunicação com a OpenAI foi interrompida. A consulta será retomada.',502,true); }
  const data=await r.json();
  if(!r.ok)throw new SafeError('Falha na OpenAI ('+r.status+', '+(data.error?.code||'request_failed')+').',502,r.status===429||r.status>=500);
  return data;
}
async function start(key:string,snapshot:any,stage:string,feedback:string[]=[],candidate?:unknown){
  const prompt=stage==='generating'?generationPrompt(snapshot,feedback):reviewPrompt(snapshot,candidate);
  return api(key,'responses',{model:REPORT_MODEL,background:true,store:true,reasoning:{effort:'medium'},max_output_tokens:stage==='generating'?12000:3500,
    instructions:prompt.instructions,input:prompt.input,text:{format:{type:'json_schema',name:stage==='generating'?'neuropsychological_report':'report_fidelity_review',strict:true,schema:stage==='generating'?documentSchema(snapshot):REVIEW_SCHEMA}}});
}
function addUsage(current:any,response:any){const usage=response.usage||{};return {input_tokens:(current.input_tokens||0)+(usage.input_tokens||0),output_tokens:(current.output_tokens||0)+(usage.output_tokens||0),responses:(current.responses||0)+1};}
async function erase(key:string,id:string){try{await api(key,'responses/'+encodeURIComponent(id),undefined,'DELETE');}catch{/* The saved clinical record does not depend on provider cleanup. */}}
async function cancel(key:string,id:string){try{await api(key,'responses/'+encodeURIComponent(id)+'/cancel',undefined,'POST');}catch{/* Already completed or cancelled. */}}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  if(req.method!=='POST')return reply({error:'Método não permitido.'},405);
  let report:any=null,admin:any=null,state:any=null,key:string|null=null;
  try{
    const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
    if(!token)throw new SafeError('Entre na sua conta para gerar laudos.',401);
    const userClient=createClient(url,anon,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:authError}=await userClient.auth.getUser(token);
    if(authError||!user)throw new SafeError('Sessão inválida. Entre novamente.',401);
    admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const body=await req.json();
    if(!['generate','poll','check'].includes(body.action))throw new SafeError('Ação inválida.');
    if(body.action==='check'||body.action==='generate'){
      if(!validId(body.patient_id))throw new SafeError('Paciente inválido.');
      const raw=await result(userClient.rpc('psico_report_source',{p_patient_id:body.patient_id}));
      if(!raw?.patient)throw new SafeError('Paciente não encontrado.',404);
      raw.settings={...DEFAULT_REPORT_SETTINGS,...(raw.settings||{})};
      const hash=await sourceHash(raw);
      if(body.action==='check')return reply({source_hash:hash,counts:{sessions:raw.sessions.length,instruments:raw.instruments.length,forms:raw.forms.length}});
      if(!validId(body.request_id))throw new SafeError('Identificador da solicitação inválido.');
      const existing=await result(admin.from('psico_reports').select('*').eq('owner_id',user.id).eq('request_id',body.request_id).maybeSingle());
      if(existing)return reply({report:publicReport(existing)});
      const active=await result(admin.from('psico_reports').select('*').eq('patient_id',body.patient_id).eq('owner_id',user.id).in('status',['generating','reviewing']).maybeSingle());
      if(active)return reply({report:publicReport(active)});
      const snapshot=makeSnapshot(raw);
      if(!snapshot.settings.professional_name.trim()||!snapshot.settings.crp.trim())throw new SafeError('Preencha o nome da profissional e o CRP em Configurar Laudos.');
      if(!snapshot.sessions.length&&!snapshot.instruments.length&&!Object.values(snapshot.patient.anamnese||{}).some(v=>typeof v==='string'?v.trim():v&&Object.keys(v).length))throw new SafeError('Registre os dados clínicos antes de gerar o laudo.');
      if(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength>MAX_SNAPSHOT_BYTES)throw new SafeError('Os dados excedem o limite de segurança de 120 KB para geração. Nenhum dado foi cortado nem enviado.',413);
      key=await result(admin.rpc('psico_report_server_key'));
      if(!key)throw new SafeError('A chave da OpenAI ainda não está configurada no servidor.',503);
      const created=await admin.from('psico_reports').insert({owner_id:user.id,patient_id:body.patient_id,request_id:body.request_id,status:'generating',model:REPORT_MODEL,source_hash:hash,source_snapshot:snapshot,validation:{version:REPORT_VERSION,attempt:1}}).select('*').single();
      if(created.error?.code==='23505'){
        const winner=await result(admin.from('psico_reports').select('*').eq('owner_id',user.id).eq('patient_id',body.patient_id).in('status',['generating','reviewing']).maybeSingle());
        if(winner)return reply({report:publicReport(winner)});
      }
      if(created.error){
        if(created.error.code==='P0001')throw new SafeError(created.error.message,429);
        throw new SafeError('Não foi possível iniciar a versão do laudo.',500);
      }
      report=created.data;state={stage:'starting',attempt:1,usage:{}};
      await result(admin.rpc('psico_report_job_put',{p_report_id:report.id,p_state:state}));
      const response=await start(key!,snapshot,'generating');
      state={...state,stage:'generating',response_id:response.id};
      await result(admin.rpc('psico_report_job_put',{p_report_id:report.id,p_state:state}));
      return reply({report:publicReport(report)},202);
    }
    if(!validId(body.report_id))throw new SafeError('Laudo inválido.');
    report=await result(admin.from('psico_reports').select('*').eq('id',body.report_id).eq('owner_id',user.id).maybeSingle());
    if(!report)throw new SafeError('Laudo não encontrado.',404);
    if(['ready','failed'].includes(report.status))return reply({report:publicReport(report)});
    state=await result(admin.rpc('psico_report_job_claim',{p_report_id:report.id}));
    if(!state)return reply({report:publicReport(report)});
    if(!state.response_id){
      if(Date.now()-Date.parse(report.created_at)>120000)throw new SafeError('A geração foi interrompida antes da confirmação do modelo. Gere uma nova versão.',502);
      await result(admin.rpc('psico_report_job_put',{p_report_id:report.id,p_state:state}));
      return reply({report:publicReport(report)});
    }
    key=await result(admin.rpc('psico_report_server_key'));
    if(!key)throw new SafeError('Credencial da OpenAI indisponível.',503);
    if(Date.now()-Date.parse(report.created_at)>MAX_REPORT_AGE_MS){
      await cancel(key!,state.response_id);
      throw new SafeError('O limite de 45 minutos foi atingido. A geração foi encerrada sem reinício automático.',502);
    }
    const response=await api(key!,'responses/'+encodeURIComponent(state.response_id));
    if(['queued','in_progress'].includes(response.status)){
      await result(admin.rpc('psico_report_job_put',{p_report_id:report.id,p_state:state}));
      return reply({report:publicReport(report)});
    }
    if(response.status!=='completed')throw new SafeError('O modelo não concluiu esta versão ('+response.status+'). Gere novamente.',502);
    const output=extractResponse(response),usage=addUsage(state.usage||{},response),snapshot=report.source_snapshot;
    let errors:string[]=[],review:any=null;
    if(state.stage==='generating')errors=validateReport(output,snapshot);
    else {
      review=output;
      if(typeof review.passed!=='boolean'||!Array.isArray(review.issues))errors=['A revisão retornou um formato inválido.'];
      else {
        const refs=new Set(snapshot.sources.map((s:any)=>s.ref));
        errors=review.issues.filter((x:any)=>x.severity==='error').map((x:any)=>x.message);
        if(review.issues.some((x:any)=>(x.source_refs||[]).some((ref:string)=>!refs.has(ref))))errors.push('A revisão referenciou uma fonte desconhecida.');
        if(!review.passed&&!errors.length)errors.push('A revisão não aprovou a fidelidade clínica.');
        errors.push(...validateReport(state.candidate,snapshot));
      }
    }
    if(errors.length){
      await erase(key!,state.response_id);
      const failed=await result(admin.from('psico_reports').update({
        status:'failed',error_message:'Esta geração não passou na verificação. Nenhuma nova chamada será feita automaticamente.',
        validation:{version:REPORT_VERSION,errors,review,attempt:1},usage,completed_at:new Date().toISOString()
      }).eq('id',report.id).select('*').single());
      await result(admin.rpc('psico_report_job_put',{p_report_id:report.id,p_state:{stage:'failed'}}));
      return reply({report:publicReport(failed)});
    }
    if(state.stage==='generating'){
      const next=await start(key!,snapshot,'reviewing',[],output);
      await result(admin.rpc('psico_report_job_put',{p_report_id:report.id,p_state:{stage:'reviewing',response_id:next.id,attempt:state.attempt,usage,candidate:output}}));
      report=await result(admin.from('psico_reports').update({status:'reviewing',usage,validation:{version:REPORT_VERSION,attempt:state.attempt,deterministic_passed:true}}).eq('id',report.id).select('*').single());
      await erase(key!,state.response_id);
      return reply({report:publicReport(report)});
    }
    const ready=await result(admin.from('psico_reports').update({status:'ready',document:state.candidate,usage,validation:{version:REPORT_VERSION,attempt:state.attempt,deterministic_passed:true,review,session_count:snapshot.sessions.length,instrument_count:snapshot.instruments.length,source_count:snapshot.sources.length},completed_at:new Date().toISOString()}).eq('id',report.id).select('*').single());
    report=ready;
    await erase(key!,state.response_id);
    await admin.rpc('psico_report_job_put',{p_report_id:report.id,p_state:{stage:'ready'}});
    return reply({report:publicReport(ready)});
  }catch(error){
    if(report?.status==='ready')return reply({report:publicReport(report)});
    const safe=error instanceof SafeError?error:new SafeError('Não foi possível concluir a operação. Tente novamente.',502);
    if(report&&admin&&state){
      // Transient poll failures preserve the resumable provider job.
      if(state.response_id&&safe.retryable&&Date.now()-Date.parse(report.created_at)<86400000&&report.status!=='failed'){
        await admin.rpc('psico_report_job_put',{p_report_id:report.id,p_state:state});
        return reply({report:publicReport(report),warning:safe.message});
      }
      await admin.from('psico_reports').update({status:'failed',error_message:safe.message,completed_at:new Date().toISOString()}).eq('id',report.id);
      if(key&&state.response_id)await erase(key,state.response_id);
      await admin.rpc('psico_report_job_put',{p_report_id:report.id,p_state:{stage:'failed'}});
    }
    return reply({error:safe.message},safe.status);
  }
});
