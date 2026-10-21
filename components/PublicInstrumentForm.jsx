"use client";

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import QuestionAnswerInput from './QuestionAnswerInput';
import { deliveryDate } from '../lib/instrumentDelivery.mjs';

export default function PublicInstrumentForm({ slug }) {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState({});
  const [sending, setSending] = useState(false);
  const [submittedAt, setSubmittedAt] = useState(null);
  const dirty = Object.keys(answers).length > 0 && !submittedAt;
  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) { setError('Formulário indisponível.'); setLoading(false); return; }
      try {
        const { data, error } = await supabase.rpc('psico_read_instrument_form', { p_slug: slug });
        if (!active) return;
        if (error) throw error;
        setForm(data);
        setSubmittedAt(data?.submitted_at || null);
      } catch { if (active) setError('Não foi possível carregar o formulário. Atualize a página para tentar novamente.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [slug]);
  useEffect(() => {
    function guard(e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  async function submit(e) {
    e.preventDefault();
    if (sending || submittedAt) return;
    setSending(true); setError('');
    try {
      const { data, error } = await supabase.rpc('psico_submit_instrument_form', { p_slug: slug, p_answers: answers });
      if (error) throw error;
      setSubmittedAt(data.submitted_at);
      setAnswers({});
    } catch (err) { setError(err?.message || 'Não foi possível enviar. Suas respostas continuam nesta página. Tente novamente.'); }
    finally { setSending(false); }
  }
  return <main className="public-form-page"><div className="public-form-card">
    <div className="public-form-brand">Painel Psico</div>
    {loading ? <p role="status">Carregando formulário…</p> : <>
      <h1>{form?.title || 'Formulário'}</h1>
      {error && <p className="notification save-error" role="alert">{error}</p>}
      {submittedAt ? <div role="status"><h2>Formulário enviado</h2><p>Suas respostas foram recebidas em {deliveryDate(submittedAt)}. Você já pode fechar esta página.</p></div>
        : form?.closed ? <p>Este instrumento já foi recebido pela psicóloga. O formulário está encerrado.</p>
        : form ? <form onSubmit={submit} className="public-form-fields">
          <p className="muted">Preencha as perguntas abaixo. Ao enviar, suas respostas serão encaminhadas à psicóloga e não poderão ser alteradas por este link.</p>
          {form.questions.map(question => <QuestionAnswerInput key={question.id} field={question} value={answers[question.id]} namePrefix="public-instrument"
            disabled={sending} onChange={value => setAnswers(prev => ({ ...prev, [question.id]: value }))} />)}
          <button className="btn primary" disabled={sending}>{sending ? 'Enviando…' : 'Enviar formulário'}</button>
        </form> : !error && <p>Este link não foi encontrado ou não está mais disponível.</p>}
    </>}
  </div></main>;
}
