"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { reportBlocks, reportFilename } from '../lib/reportContent.mjs';
import { InstrumentTable } from './InstrumentTables';
const active=report=>['generating','reviewing'].includes(report?.status);
const stamp=value=>new Date(value).toLocaleString('pt-BR');
async function invoke(body){
  const {data,error}=await supabase.functions.invoke('report-ai',{body});
  if(error){let message='Não foi possível consultar a geração. Tente novamente.';try{message=(await error.context.json()).error||message;}catch{}throw new Error(message);}
  if(data.error)throw new Error(data.error);return data;
}
export default function ReportPanel({patientId,beforeGenerate,conclusion,onConclusionChange}){
  const [versions,setVersions]=useState([]),[selectedId,setSelectedId]=useState(''),[report,setReport]=useState(null);
  const [job,setJob]=useState(null),[loading,setLoading]=useState(true),[starting,setStarting]=useState(false),[downloading,setDownloading]=useState(false);
  const [error,setError]=useState(''),[warning,setWarning]=useState(''),[stale,setStale]=useState(false);
  const mounted=useRef(true),requestId=useRef(null);
  const refresh=useCallback(async(preferred)=>{
    const {data,error}=await supabase.from('psico_reports').select('id,status,created_at,completed_at,error_message,validation,model').eq('patient_id',patientId).order('created_at',{ascending:false}).limit(50);
    if(error)throw new Error('Não foi possível carregar os laudos.');
    if(!mounted.current)return;
    setVersions(data||[]);setJob((data||[]).find(active)||null);
    if(preferred)setSelectedId(preferred);else setSelectedId(prev=>prev||(data||[]).find(r=>r.status==='ready')?.id||'');
  },[patientId]);
  useEffect(()=>{mounted.current=true;void refresh().catch(e=>setError(e.message)).finally(()=>setLoading(false));return()=>{mounted.current=false;};},[refresh]);
  useEffect(()=>{
    let cancelled=false;setReport(null);setStale(false);
    if(!selectedId)return;
    void supabase.from('psico_reports').select('*').eq('id',selectedId).eq('patient_id',patientId).single().then(({data,error})=>{
      if(cancelled)return;if(error){setError('Não foi possível abrir esta versão.');return;}setReport(data);
    });return()=>{cancelled=true;};
  },[selectedId,patientId]);
  useEffect(()=>{
    if(!report)return;let cancelled=false;
    void invoke({action:'check',patient_id:patientId}).then(data=>{if(!cancelled)setStale(data.source_hash!==report.source_hash);}).catch(()=>{if(!cancelled)setWarning('Não foi possível conferir se há alterações posteriores a esta versão.');});
    return()=>{cancelled=true;};
  },[report,patientId]);
  useEffect(()=>{
    if(!job?.id)return;
    let cancelled=false,timer;
    async function poll(){
      try{
        const data=await invoke({action:'poll',report_id:job.id});if(cancelled)return;
        setJob(active(data.report)?data.report:null);setWarning(data.warning||'');
        if(!active(data.report)){await refresh(data.report.status==='ready'?data.report.id:undefined);if(data.report.status==='failed')setError(data.report.error_message||'Esta versão não passou na validação.');return;}
      }catch(e){if(cancelled)return;setWarning(e.message+' A consulta será retomada automaticamente.');}
      if(!cancelled)timer=setTimeout(poll,7000);
    }
    void poll();return()=>{cancelled=true;clearTimeout(timer);};
  },[job?.id,refresh]);
  async function generate(){
    if(starting||job)return;setStarting(true);setError('');setWarning('');
    try{
      if(!await beforeGenerate())throw new Error('Existem alterações não salvas. Corrija o salvamento antes de gerar.');
      requestId.current ||= crypto.randomUUID();
      const data=await invoke({action:'generate',patient_id:patientId,request_id:requestId.current});
      if(!mounted.current)return;requestId.current=null;
      if(data.report.status==='failed')setError(data.report.error_message);
      await refresh(data.report.status==='ready'?data.report.id:undefined);
    }catch(e){if(mounted.current)setError(e.message);}finally{if(mounted.current)setStarting(false);}
  }
  async function download(){
    setDownloading(true);setError('');
    try{
      const {reportDocxBlob}=await import('../lib/reportDocx.mjs');
      const blob=await reportDocxBlob(report);const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=reportFilename(report);document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }catch(e){setError(e.message||'Não foi possível gerar o Word.');}finally{setDownloading(false);}
  }
  return <div className="ai-report">
    <div className="card report-tools"><div className="cardhead"><div><h2>Laudo com inteligência artificial</h2><p className="muted">GPT-6.1 Sol · modelo de seis seções</p></div><button className="btn primary" disabled={starting||!!job||loading} onClick={generate}>{starting?'Iniciando…':job?'Geração em andamento…':'Gerar Laudo'}</button></div>
      <div className="cardbody">
        <p className="muted">A geração utiliza todos os dados clínicos salvos: anamnese, sessões, instrumentos, tabelas e respostas dos formulários. Cada versão passa por verificações de estrutura, sessões, valores e uma segunda revisão de fidelidade pelo modelo.</p>
        <p className="report-review-note">Rascunho para revisão da psicóloga responsável. Confira a análise e a conclusão antes de emitir o documento.</p>
        {error&&<p role="alert" className="report-error">{error}</p>}{warning&&<p role="status" className="report-warning">{warning}</p>}
        {job&&<div className="report-progress" role="status"><span className="report-spinner"/><div><b>{job.status==='reviewing'?'Revisando a fidelidade clínica…':'Redigindo e conferindo o laudo…'}</b><p>Isso pode levar alguns minutos. Você pode mudar de seção; o acompanhamento será retomado ao abrir o laudo.</p>{job.validation?.attempt>1&&<p>A primeira redação exigiu correções. Uma nova conferência está em andamento.</p>}</div></div>}
        {!!versions.length&&<label className="field"><span>Versões do laudo</span><select aria-label="Versões do laudo" value={selectedId} onChange={e=>setSelectedId(e.target.value)}><option value="">Selecione uma versão validada</option>{versions.filter(r=>r.status==='ready').map(r=><option key={r.id} value={r.id}>{stamp(r.completed_at||r.created_at)}</option>)}</select></label>}
        {versions.filter(v=>v.status==='failed').slice(0,1).map(v=><details className="report-validation" key={v.id}><summary>Geração não concluída — {stamp(v.created_at)}</summary><p>{v.error_message}</p>{v.validation?.errors?.map((text,i)=><p key={i}>{text}</p>)}</details>)}
        {report&&<>
          <p className="muted">Versão de {stamp(report.completed_at)} · {report.validation.session_count} sessões e {report.validation.instrument_count} instrumentos conferidos.</p>
          {stale&&<p className="report-warning" role="status">Os registros ou o modelo foram alterados após esta geração. Gere uma nova versão para incluir as alterações.</p>}
          {!!report.validation.review?.issues?.length&&<details className="report-validation"><summary>Pontos de atenção da revisão</summary>{report.validation.review.issues.map((x,i)=><p key={i}>{x.message}</p>)}</details>}
          <div className="actions"><button className="btn primary" disabled={downloading} onClick={download}>{downloading?'Preparando Word…':'Baixar DOCX'}</button><button className="btn" onClick={()=>window.print()}>Imprimir / PDF</button></div>
        </>}
      </div>
    </div>
    <details className="card report-tools report-clinician-notes"><summary>Conclusão registrada pela profissional</summary><div className="cardbody"><label className="field"><span>Informações clínicas para considerar na próxima geração</span><textarea value={conclusion||''} onChange={e=>onConclusionChange(e.target.value)} rows={5}/></label><p className="muted">Salva automaticamente na ficha. Para incorporar alterações ao laudo, gere uma nova versão.</p></div></details>
    {loading?<p role="status">Carregando laudos…</p>:!report&&!job?<div className="card cardbody report-tools"><h3>{selectedId?'Abrindo versão…':'Seu laudo começa com os registros do paciente'}</h3><p>Use Gerar Laudo para criar uma versão com o modelo configurado. As versões anteriores são preservadas.</p></div>:null}
    {report&&<article className="paper">{reportBlocks(report).map((block,i)=>block.type==='heading'?(block.level===1?<h1 key={i}>{block.text}</h1>:block.level===2?<h2 key={i}>{block.text}</h2>:<h3 key={i}>{block.text}</h3>):block.type==='table'?<InstrumentTable key={i} table={block.table} readOnly/>:<p key={i} className={(block.metadata?'report-meta-line ':'')+(block.signature?'report-signature':'')}>{block.text}</p>)}</article>}
  </div>;
}
