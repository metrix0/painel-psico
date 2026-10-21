export function instrumentForm(instrument) {
  return Array.isArray(instrument.form) ? instrument.form[0] : instrument.form;
}
export function isLaterSession(session, source) {
  if (!source || session.id === source.id) return false;
  const dateDifference = (session.occurred_on || '').localeCompare(source.occurred_on || '');
  if (dateDifference !== 0) return dateDifference > 0;
  return (session.created_at || '').localeCompare(source.created_at || '') > 0;
}
export function waitingInSession(instrument, session, sessions) {
  return Boolean(instrument.sent_at && !instrument.received_at &&
    isLaterSession(session, sessions.find(s => s.id === instrument.sent_session_id)));
}
export function deliveryDate(value) {
  return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
}
export function publicFormUrl(slug) {
  return `https://psico.johnvitor.com/${encodeURIComponent(slug)}`;
}
