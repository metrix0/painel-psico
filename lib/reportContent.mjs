import { REPORT_HEADINGS, dateBR } from '../supabase/functions/_shared/reportCore.mjs';

// Both screen and Word consume the same accepted narrative and immutable source values.
export function reportBlocks(report) {
  const s=report.source_snapshot,d=report.document,p=s.patient,settings=s.settings;
  const blocks=[];
  const paragraph=(text,extra={})=>{if(text)blocks.push({type:'paragraph',text,...extra});};
  const heading=(text,level=2)=>blocks.push({type:'heading',text,level});
  const prose=items=>(items||[]).forEach(p=>paragraph(p.text));
  heading(settings.title,1);
  if(report.validation?.manual_draft)paragraph('DOCUMENTO PRELIMINAR — pendente de conferência e assinatura profissional.',{metadata:true});
  heading('1. '+REPORT_HEADINGS[0]);
  for(const [label,value] of [['Nome',p.name],['Nascimento',p.birth_date?dateBR(p.birth_date):''],['Escolaridade',p.grade],['Escola',p.school],['Responsável',p.guardian],['Solicitante',p.requester],['Profissional',settings.professional_name],['CRP',settings.crp]])if(value)paragraph(label+': '+value,{metadata:true});
  heading('2. '+REPORT_HEADINGS[1]);prose(d.demand);
  heading('3. '+REPORT_HEADINGS[2]);
  prose(d.procedure);
  heading('4. '+REPORT_HEADINGS[3]);prose(d.analysis.overview);
  for(const session of s.sessions){
    heading(dateBR(session.occurred_on)+(session.title?' — '+session.title:''),3);
    prose(d.analysis.sessions.find(x=>x.session_id===session.id)?.paragraphs);
  }
  for(const instrument of s.instruments){
    // Unscored and pending tests belong in the clinical database, not in the final narrative.
    const hasScores=(instrument.scores||[]).some(score=>score.value!==null&&score.value!==undefined&&String(score.value).trim()!=='');
    const hasTableResults=(instrument.tables||[]).some(table=>(table.cells||[]).some(cell=>cell.editable&&String(cell.text||'').trim()));
    if(!hasScores&&!hasTableResults)continue;
    if(/^pendente$/i.test(instrument.status)&&!hasScores&&!hasTableResults)continue;
    heading(instrument.name,3);
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
  if(d.limitations?.length&&!report.validation?.manual_draft){heading('Limitações e informações a complementar',3);d.limitations.forEach(text=>paragraph(text));}
  if(settings.validity)paragraph('Validade e finalidade: '+settings.validity);
  paragraph((settings.city?settings.city+', ':'')+dateBR(report.completed_at||report.created_at),{signature:true});
  if(report.validation?.manual_draft){
    paragraph('Profissional responsável indicada: '+settings.professional_name+' — CRP '+settings.crp,{signature:true});
    paragraph('Assinatura e validação profissional pendentes.',{signature:true});
  }else{
    paragraph(settings.professional_name+' — CRP '+settings.crp,{signature:true});
  }
  return blocks;
}
export const reportFilename=report=>'laudo-'+report.source_snapshot.patient.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+(report.completed_at||report.created_at).slice(0,10)+'.docx';
