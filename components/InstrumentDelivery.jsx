"use client";

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QuestionAnswerInput from './QuestionAnswerInput';
import { deliveryDate, instrumentForm, publicFormUrl } from '../lib/instrumentDelivery.mjs';

export default function InstrumentDelivery({ instrument, hasForm, sessions, busy, onAction }) {
  const [sendingSession, setSendingSession] = useState('');
  const [receivingSession, setReceivingSession] = useState('');
  const [showResponses, setShowResponses] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const responsesButton = useRef(null);
  useEffect(() => {
    if (!showResponses) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; responsesButton.current?.focus(); };
  }, [showResponses]);
  const form = instrumentForm(instrument);
  const sentSessionId = instrument.sent_at ? (instrument.sent_session_id || '') : (sendingSession || sessions[0]?.id || '');
  const receivedSessionId = receivingSession || sessions[0]?.id || '';
  const sessionOptions = sessions.map(s => <option key={s.id} value={s.id}>{s.title || 'Sessão'} — {s.occurred_on?.split('-').reverse().join('/')}</option>);

  return <div className="instrument-delivery">
    <div className="delivery-dates">
      {instrument.sent_at && <span>Enviado em {deliveryDate(instrument.sent_at)}</span>}
      {instrument.received_at && <span>Recebido / concluído em {deliveryDate(instrument.received_at)}</span>}
    </div>
    {!instrument.sent_at && !instrument.received_at && <div>
      <div className="instrument-send-row">
        <label className="field"><span>Sessão de envio</span><select aria-label="Sessão de envio" value={sentSessionId} disabled={busy} onChange={e => setSendingSession(e.target.value)}>
          {sessionOptions}
        </select></label>
        <button className="btn soft" disabled={busy || !sentSessionId} onClick={() => onAction(instrument.id, 'send', sentSessionId)}>Enviar Instrumento</button>
      </div>
      <p className="muted">Registra o envio ao paciente na sessão selecionada.</p>
    </div>}
    {instrument.sent_at && <label className="field instrument-sent-session"><span>Sessão de envio</span><select aria-label="Alterar sessão de envio" value={sentSessionId} disabled={busy} onChange={e => onAction(instrument.id, 'set_sent_session', e.target.value)}>
      {sessionOptions}
    </select></label>}
    {instrument.sent_at && !instrument.received_at && <div className="instrument-receive-row">
      <label className="field"><span>Sessão de recebimento</span><select aria-label="Sessão de recebimento" value={receivedSessionId} disabled={busy} onChange={e => setReceivingSession(e.target.value)}>
        {sessionOptions}
      </select></label>
      <button className="btn" disabled={busy || !receivedSessionId} onClick={() => onAction(instrument.id, 'receive', receivedSessionId)}>Marcar como recebido</button>
    </div>}
    {hasForm && !form && !instrument.received_at && <button className="btn soft" disabled={busy} onClick={() => onAction(instrument.id, 'generate')}>Gerar formulário</button>}
    {form?.submitted_at ? <button ref={responsesButton} className="text-btn" onClick={() => setShowResponses(true)}>Formulário recebido ({deliveryDate(form.submitted_at)})</button>
      : form && !instrument.received_at ? <div className="form-share">
        <label className="field"><span>Link do formulário</span><input aria-label="Link do formulário" readOnly value={publicFormUrl(form.slug)} onFocus={e => e.target.select()} /></label>
        <button className="btn" onClick={async () => {
          try { await navigator.clipboard.writeText(publicFormUrl(form.slug)); setCopyMessage('Link copiado.'); }
          catch { setCopyMessage('Selecione o link acima para copiá-lo.'); }
        }}>Copiar link</button>
        <span role="status" className="muted">{copyMessage}</span>
      </div> : form ? <p className="muted">Formulário encerrado: instrumento recebido manualmente.</p> : null}
    {showResponses && form?.submitted_at && createPortal(<div className="modal-shade" onClick={() => setShowResponses(false)}>
      <div className="modal form-response-modal" role="dialog" aria-modal="true" aria-label="Respostas do formulário" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setShowResponses(false); if (e.key === 'Tab') e.preventDefault(); }}>
        <div className="instrument-form-heading"><h2>{form.title}</h2><button autoFocus className="btn" onClick={() => setShowResponses(false)}>Fechar</button></div>
        <p className="muted">Recebido em {deliveryDate(form.submitted_at)}</p>
        {form.questions.map(question => <QuestionAnswerInput key={question.id} field={question} value={form.answers?.[question.id]} disabled namePrefix={`received-${form.id}`} />)}
      </div>
    </div>, document.body)}
  </div>;
}
