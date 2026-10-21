"use client";

export default function InstrumentFormEditor({ questions, onChange }) {
  function patch(id, change) { onChange(questions.map(q => q.id === id ? { ...q, ...change } : q)); }
  return <div className="instrument-form-editor">
    <div className="instrument-form-heading"><h3>Formulário</h3>
      {questions !== null && <button className="text-btn" onClick={() => {
        if (window.confirm('Remover o formulário deste modelo? Os links já gerados serão preservados.')) onChange(null);
      }}>Remover formulário</button>}
    </div>
    {questions === null ? <button className="btn soft" onClick={() => onChange([])}>+ Adicionar formulário</button> : <>
      <p className="muted">Configure as perguntas que serão respondidas pelo paciente ou responsável.</p>
      {questions.map((question, index) => <div className="session-field-editor" key={question.id}>
        <div className="session-field-config-row">
          <label className="field"><span>Pergunta {index + 1}</span><input aria-label={`Pergunta do formulário ${index + 1}`} value={question.label} onChange={e => patch(question.id, { label: e.target.value })} /></label>
          <label className="field"><span>Tipo de resposta</span><select aria-label={`Tipo da pergunta ${index + 1}`} value={question.field_type} onChange={e => patch(question.id, { field_type: e.target.value })}>
            <option value="text">Texto curto</option><option value="textarea">Texto longo</option>
            <option value="single">Escolha única (círculos)</option><option value="multiple">Múltipla escolha</option>
          </select></label>
        </div>
        {['single', 'multiple'].includes(question.field_type) && <label className="field"><span>Opções (uma por linha)</span>
          <textarea aria-label={`Opções da pergunta ${index + 1}`} value={(question.options || []).join('\n')} onChange={e => patch(question.id, { options: e.target.value.split('\n') })} />
        </label>}
        <button className="text-btn" onClick={() => {
          if (window.confirm('Remover esta pergunta?')) onChange(questions.filter(q => q.id !== question.id));
        }}>Remover pergunta</button>
      </div>)}
      <button className="btn soft" disabled={questions.length >= 100} onClick={() => onChange([...questions, { id: crypto.randomUUID(), label: '', field_type: 'text', options: [] }])}>+ Adicionar pergunta ao formulário</button>
    </>}
  </div>;
}
