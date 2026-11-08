import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSnapshot, sourceHash, validateReport, REPORT_VERSION, extractResponse, documentSchema } from '../supabase/functions/_shared/reportCore.mjs';
import { reportBlocks } from '../lib/reportContent.mjs';
const raw={patient:{id:'p',name:'Paciente fictício',birth_date:'2015-02-03',anamnese:{motivo:'Dificuldade escolar. Registro de 3 tarefas.'}},sessions:[{id:'s1',occurred_on:'2026-10-01',duration_minutes:50,notes:'Entrevista'},{id:'s2',occurred_on:'2026-10-08',duration_minutes:40,notes:''}],instruments:[{id:'i1',name:'Questionário',status:'Pendente',tables:[]}],forms:[{id:'f1',answers:{a:'Resposta familiar'}}],settings:{}};
const snapshot=makeSnapshot(raw);
const prose=()=>[{text:'Dados insuficientes para conclusão diagnóstica.',source_refs:['patient']}];
const valid=()=>({schema_version:REPORT_VERSION,patient_id:'p',patient_name:'Paciente fictício',demand:prose(),procedure:prose(),analysis:{overview:prose(),sessions:snapshot.sessions.map(s=>({session_id:s.id,occurred_on:s.occurred_on,duration_minutes:s.duration_minutes,paragraphs:prose()})),instruments:[{instrument_id:'i1',name:'Questionário',paragraphs:prose()}],integration:prose()},conclusion:prose(),referrals:prose(),limitations:[],data_coverage:snapshot.sources.map(s=>s.ref),numeric_claims:[]});
test('complete report passes with blank session explicitly represented',()=>assert.deepEqual(validateReport(valid(),snapshot),[]));
test('missing session fails',()=>{const d=valid();d.analysis.sessions.pop();assert.match(validateReport(d,snapshot).join(),/Sessões/);});
test('duplicated session cannot replace a missing session',()=>{const d=valid();d.analysis.sessions=[d.analysis.sessions[0],d.analysis.sessions[0]];assert.match(validateReport(d,snapshot).join(),/duplicados/);});
test('session dates and duration must exactly match',()=>{const d=valid();d.analysis.sessions[0].occurred_on='2026-10-02';d.analysis.sessions[1].duration_minutes=60;assert.equal(validateReport(d,snapshot).filter(e=>e.includes('divergente')).length,2);});
test('missing instrument fails',()=>{const d=valid();d.analysis.instruments=[];assert.match(validateReport(d,snapshot).join(),/Instrumentos/);});
test('patient identity cannot be replaced',()=>{const d=valid();d.patient_name='Outro paciente';assert.match(validateReport(d,snapshot).join(),/Identificação/);});
test('omitted form source fails',()=>{const d=valid();d.data_coverage=d.data_coverage.filter(r=>r!=='form:f1');assert.match(validateReport(d,snapshot).join(),/form:f1/);});
test('unknown evidence reference fails',()=>{const d=valid();d.conclusion[0].source_refs=['invented'];assert.match(validateReport(d,snapshot).join(),/fonte válida/);});
test('invented number without evidence fails',()=>{const d=valid();d.conclusion[0].text='Percentil 99.';assert.match(validateReport(d,snapshot).join(),/Número sem evidência: 99/);});
test('number with fabricated quote fails',()=>{const d=valid();d.conclusion[0].text='Percentil 99.';d.numeric_claims=[{literal:'99',source_ref:'patient',quote:'Percentil 99'}];assert.match(validateReport(d,snapshot).join(),/Evidência numérica inválida/);});
test('numeric evidence requires values, never JSON keys',()=>{const d=valid();d.conclusion[0].text='Registro de 3 tarefas.';d.numeric_claims=[{literal:'3',source_ref:'patient',quote:'Registro de 3 tarefas.'}];assert.deepEqual(validateReport(d,snapshot),[]);});
test('hash ignores capture time and visit-only patient timestamps',async()=>{assert.equal(await sourceHash({...raw,captured_at:'a',patient:{...raw.patient,updated_at:'a',last_visited_at:'a'}}),await sourceHash({...raw,captured_at:'b',patient:{...raw.patient,updated_at:'b',last_visited_at:'b'}}));});
test('hash detects changed answers, observations and settings',async()=>{const hash=await sourceHash(raw);for(const changed of [{...raw,forms:[{id:'f1',answers:{a:'Outra resposta'}}]},{...raw,sessions:[...raw.sessions,{id:'s3'}]},{...raw,settings:{title:'Outro modelo'}}])assert.notEqual(await sourceHash(changed),hash);});
test('unfinished, empty, malformed or refused provider output never becomes a report',()=>{for(const r of [{status:'incomplete'},{status:'completed',output:[]},{status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]},{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'not json'}]}]}])assert.throws(()=>extractResponse(r));});
test('output schema is strict throughout nested objects',()=>{function walk(node){if(node.type==='object'){assert.equal(node.additionalProperties,false);assert.deepEqual(node.required,Object.keys(node.properties));Object.values(node.properties).forEach(walk);}if(node.items)walk(node.items);}walk(documentSchema(snapshot));});
test('laudo renders dated sessions, suppresses empty tests and includes professional closing and delivery',()=>{const report={status:'ready',document:valid(),source_snapshot:snapshot,completed_at:'2026-10-21'};const b=reportBlocks(report);for(const date of ['01/10/2026','08/10/2026'])assert.ok(b.some(x=>x.type==='heading'&&x.text.includes(date)));assert.equal(b.filter(x=>x.type==='heading'&&x.level===2).length,7);assert.ok(!b.some(x=>x.text==='Questionário'));assert.ok(b.some(x=>x.text==='Termo de entrega'));assert.ok(b.some(x=>x.text?.includes('CRP')));assert.ok(!b.some(x=>/Assinatura e validação profissional pendentes/i.test(x.text||'')));});
test('malformed nested output is rejected before narrative validation',()=>{for(const mutate of [d=>d.analysis.sessions[0].paragraphs='invalid',d=>delete d.numeric_claims,d=>d.unexpected='injected',d=>d.conclusion[0].text=3]){const d=valid();mutate(d);assert.ok(validateReport(d,snapshot).length);}});
test('numeric evidence must be attached to a source cited by that paragraph',()=>{const d=valid();d.conclusion[0].text='Duração de 50 minutos.';d.numeric_claims=[{literal:'50',source_ref:'session:s1',quote:'50'}];assert.match(validateReport(d,snapshot).join(),/Número sem evidência/);});

test('laudo shows only filled tables and identifies respondent source without changing patient records',()=>{
  const table=value=>({title:'Resultado Vineland',rows:2,cols:2,cells:[
    {row:0,col:0,text:'Domínio',editable:false},{row:0,col:1,text:'Escore',editable:false},
    {row:1,col:0,text:'Comunicação',editable:false},{row:1,col:1,text:value,editable:true}
  ]});
  const instruments=[
    {id:'iParent',name:'Vineland-3 — Pais/Cuidadores',notes:'formulario respondido pelos pais',status:'Concluído',tables:[table('78')]},
    {id:'iTeacher',name:'Vineland-3 — Pais/Cuidadores',notes:'formulario respondido pela professora',status:'Concluído',tables:[table('77')]},
    {id:'iEmpty',name:'WISC-IV',status:'Pendente',tables:[table('')]}
  ];
  const adapted=makeSnapshot({...raw,instruments});
  const d=valid();d.analysis.instruments=[];
  const blocks=reportBlocks({status:'ready',document:d,source_snapshot:adapted,completed_at:'2026-10-21'});
  const headings=blocks.filter(x=>x.type==='heading').map(x=>x.text);
  assert.ok(headings.includes('Vineland-3 — formulário dos responsáveis'));
  assert.ok(headings.includes('Vineland-3 — formulário da professora'));
  assert.ok(!headings.includes('WISC-IV'));
  assert.equal(blocks.filter(x=>x.type==='table').length,2);
  assert.ok(blocks.some(x=>x.text?.includes('Com a escola: Vineland-3')));
  assert.ok(blocks.some(x=>x.text?.includes('Com os responsáveis: Vineland-3')));
});
test('multiple scored domains require substantive interpretation rather than one generic paragraph',()=>{
  const table={title:'Resultados',rows:5,cols:2,cells:[
    {row:0,col:0,text:'Domínio',editable:false},{row:0,col:1,text:'Escore',editable:false},
    ...Array.from({length:4},(_,i)=>[{row:i+1,col:0,text:'Domínio '+String.fromCharCode(65+i),editable:false},{row:i+1,col:1,text:String(i+1),editable:true}]).flat()
  ]};
  const scored=makeSnapshot({...raw,instruments:[{id:'scored',name:'Instrumento sintético',tables:[table]}]});
  const d=valid();d.analysis.instruments=[{instrument_id:'scored',name:'Instrumento sintético',paragraphs:[{text:'Resultado global na média.',source_refs:['instrument:scored']}]}];
  d.data_coverage=scored.sources.map(x=>x.ref);
  const errors=validateReport(d,scored).join(' | ');
  assert.match(errors,/Análise insuficiente de domínios/);
  assert.match(errors,/Descrição clínica excessivamente resumida/);
});
