import { REPORT_HEADINGS, dateBR } from '../supabase/functions/_shared/reportCore.mjs';

// Both screen and Word consume the same accepted narrative and immutable source values.
const filledResultRows=instrument=>new Set((instrument.tables||[]).flatMap(table=>
  (table.cells||[]).filter(cell=>cell.editable&&String(cell.text||'').trim()).map(cell=>(table.title||'')+':'+cell.row)
));
const hasResults=instrument=>filledResultRows(instrument).size>0||
  (instrument.scores||[]).some(score=>score.value!==null&&score.value!==undefined&&String(score.value).trim()!=='');
const respondent=instrument=>{
  const notes=(instrument.notes||'').toLowerCase();
  if(/professor(?:a|es)?/.test(notes))return 'escola';
  if(/(?:pelos? pais|respons[aá]v|fam[ií]li)/.test(notes)||/snap.*familiar/i.test(instrument.name))return 'responsáveis';
  return 'outros';
};
const instrumentLabel=instrument=>{
  if(/vineland/i.test(instrument.name)){
    const group=respondent(instrument);
    return group==='escola'?'Vineland-3 — formulário da professora':group==='responsáveis'?'Vineland-3 — formulário dos responsáveis':instrument.name;
  }
  return instrument.name;
};
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
  prose(d.procedure);
  const assessed=s.instruments.filter(hasResults);
  if(assessed.length){
    paragraph('Instrumentos utilizados na avaliação:');
    for(const [group,label] of [['responsáveis','Com os responsáveis'],['escola','Com a escola'],['outros','Demais instrumentos']]){
      const names=[...new Set(assessed.filter(i=>respondent(i)===group).map(instrumentLabel))];
      if(names.length)paragraph(label+': '+names.join('; ')+'.');
    }
  }
  heading('4. '+REPORT_HEADINGS[3]);prose(d.analysis.overview);
  if(s.sessions.length){
    heading('Observações comportamentais durante as sessões',3);
    const orderedSessions=[...s.sessions].sort((a,b)=>
      String(a.occurred_on||'').localeCompare(String(b.occurred_on||''))||
      (s.sessions.indexOf(a)-s.sessions.indexOf(b))
    );
    orderedSessions.forEach((session,index)=>{
      const notes=d.analysis.sessions.find(x=>x.session_id===session.id)?.paragraphs;
      if(!notes?.length)return;
      heading(dateBR(session.occurred_on)+' — '+(session.title||'Sessão '+(index+1)),3);
      prose(notes);
    });
  }
  for(const instrument of s.instruments){
    // Keep pending, duplicate and empty templates in the clinical record, not the laudo.
    if(!hasResults(instrument))continue;
    heading(instrumentLabel(instrument),3);
    prose(d.analysis.instruments.find(x=>x.instrument_id===instrument.id)?.paragraphs);
    for(const table of instrument.tables||[]){
      if(!(table.cells||[]).some(cell=>cell.editable&&String(cell.text||'').trim()))continue;
      blocks.push({type:'table',table});
    }
    if(instrument.scores?.length){
      const rows=[['Indicador','Resultado registrado'],...instrument.scores.map(score=>[score.label||'',String(score.value??'')])];
      blocks.push({type:'table',table:{title:'Resultados registrados',rows:rows.length,cols:2,cells:rows.flatMap((row,r)=>row.map((text,c)=>({row:r,col:c,rowSpan:1,colSpan:1,text})))}});
    }
  }
  prose(d.analysis.integration);
  heading('5. '+REPORT_HEADINGS[4]);prose(d.conclusion);
  heading('6. '+REPORT_HEADINGS[5]);prose(d.referrals);
  if(settings.validity)paragraph('Validade do laudo: '+settings.validity);
  paragraph('Os resultados expressam as condições observadas no período da avaliação e devem ser compreendidos à luz da história e do contexto do paciente.');
  paragraph('Este documento é sigiloso e destina-se à finalidade descrita na identificação.');
  paragraph('Coloco-me à disposição para eventuais esclarecimentos.');
  paragraph((settings.city?settings.city+', ':'')+dateBR(report.completed_at||report.created_at),{signature:true});
  paragraph(settings.professional_name,{signature:true});
  paragraph('Psicóloga/Neuropsicóloga — CRP '+settings.crp,{signature:true});
  heading('Termo de entrega',2);
  paragraph('Declaro ter recebido o laudo psicológico referente à avaliação neuropsicológica, após esclarecimentos sobre seu conteúdo.');
  paragraph('Data da entrega: ____/____/________');
  paragraph('Responsável pelo recebimento: _______________________________________');
  return blocks;
}
export const reportFilename=report=>'laudo-'+report.source_snapshot.patient.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+(report.completed_at||report.created_at).slice(0,10)+'.docx';
