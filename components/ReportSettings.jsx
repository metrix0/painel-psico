"use client";
export default function ReportSettings({settings,onChange,status}){
  return <section className="card"><div className="cardhead"><h2>Configurar Laudos</h2><span className="muted">{status}</span></div><div className="cardbody">
    <p className="muted">Modelo baseado na estrutura dos laudos fornecidos: identificação, demanda, procedimento, resultado e análise, conclusão e encaminhamento. A geração usa GPT-6.1 Sol e todos os registros clínicos do paciente.</p>
    {!settings?<p role="status">Carregando configuração…</p>:<>
      <div className="fields">{[['professional_name','Nome da profissional'],['crp','CRP'],['city','Cidade'],['title','Título do documento']].map(([key,label])=><label className="field" key={key}><span>{label}</span><input value={settings[key]} onChange={e=>onChange({...settings,[key]:e.target.value})}/></label>)}</div>
    </>}
  </div></section>;
}
