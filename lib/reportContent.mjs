import { REPORT_HEADINGS, dateBR } from '../supabase/functions/_shared/reportCore.mjs';

// Both screen and Word consume the same accepted narrative and immutable source values.
export function reportBlocks(report) {
  const s=report.source_snapshot,d=report.document,p=s.patient,settings=s.settings;
  const blocks=[];
  const paragraph=(text,extra={})=>{if(text)blocks.push({type:'paragraph',text,...extra});};
  const heading=(text,level=2)=>blocks.push({type:'heading',text,level});
  const prose=items=>(items||[]).forEach(p=>paragraph(p.text));
  heading(settings.title,1);
  heading('1. '+REPORT_HEADINGS[0]);
  for(const [label,value] of [['Nome',p.name],['Nascimento',p.birth_date?dateBR(p.birth_date):''],['Escolaridade',p.grade],['Escola',p.school],['Responsável',p.guardian],['Solicitante',p.requester],['Profissional',settings.professional_name],['CRP',settings.crp]])if(value)paragraph(label+': '+value,{metadata:true});
  heading('2. '+REPORT_HEADINGS[1]);prose(d.demand);
  heading('3. '+REPORT_HEADINGS[2]);
  paragraph('Sessões registradas: '+s.sessions.length+'.'+(s.derived.evaluation_start?' Período: '+dateBR(s.derived.evaluation_start)+' a '+dateBR(s.derived.evaluation_end)+'.':''),{metadata:true});
  prose(d.procedure);
  heading('4. '+REPORT_HEADINGS[3]);prose(d.analysis.overview);
  for(const session of s.sessions){
    heading(dateBR(session.occurred_on)+(session.title?' — '+session.title:'')+' ('+session.duration_minutes+' min)',3);
    prose(d.analysis.sessions.find(x=>x.session_id===session.id)?.paragraphs);
  }
  for(const instrument of s.instruments){
    heading(instrument.name,3);paragraph('Situação: '+instrument.status,{metadata:true});
    if(instrument.sent_at)paragraph('Enviado: '+dateBR(instrument.sent_at)+(instrument.received_at?' • Recebido: '+dateBR(instrument.received_at):' • Aguardando devolução'),{metadata:true});
    prose(d.analysis.instruments.find(x=>x.instrument_id===instrument.id)?.paragraphs);
    for(const table of instrument.tables||[])blocks.push({type:'table',table});
    if(instrument.scores?.length){
      const rows=[['Indicador','Resultado registrado'],...instrument.scores.map(score=>[score.label||'',String(score.value??'')])];
      blocks.push({type:'table',table:{title:'Resultados registrados',rows:rows.length,cols:2,cells:rows.flatMap((row,r)=>row.map((text,c)=>({row:r,col:c,rowSpan:1,colSpan:1,text})))}});
    }
  }
  prose(d.analysis.integration);
  heading('5. '+REPORT_HEADINGS[4]);prose(d.conclusion);
  heading('6. '+REPORT_HEADINGS[5]);prose(d.referrals);
  if(d.limitations?.length){heading('Limitações e informações a complementar',3);d.limitations.forEach(text=>paragraph(text));}
  if(settings.validity)paragraph('Validade e finalidade: '+settings.validity);
  paragraph((settings.city?settings.city+', ':'')+dateBR(report.completed_at||report.created_at),{signature:true});
  paragraph(settings.professional_name+' — CRP '+settings.crp,{signature:true});
  return blocks;
}
export const reportFilename=report=>'laudo-'+report.source_snapshot.patient.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+(report.completed_at||report.created_at).slice(0,10)+'.docx';
