import test from 'node:test';
import assert from 'node:assert/strict';
import { waitingInSession, isLaterSession, publicFormUrl } from '../lib/instrumentDelivery.mjs';
const sessions = [
  { id: 's1', occurred_on: '2026-10-20', created_at: '2026-10-20T10:00:00Z' },
  { id: 's2', occurred_on: '2026-10-21', created_at: '2026-10-20T09:00:00Z' },
  { id: 's3', occurred_on: '2026-10-20', created_at: '2026-10-20T11:00:00Z' }
];
test('waiting banners follow the original sending session, including sessions on the same day', () => {
  const instrument = { sent_at: '2026-10-20T10:30:00Z', sent_session_id: 's1', session_id: 's2' };
  assert.equal(waitingInSession(instrument, sessions[0], sessions), false);
  assert.equal(waitingInSession(instrument, sessions[1], sessions), true);
  assert.equal(waitingInSession(instrument, sessions[2], sessions), true);
  assert.equal(isLaterSession(sessions[0], sessions[1]), false);
  assert.equal(waitingInSession({ ...instrument, received_at: '2026-10-21T11:00:00Z' }, sessions[1], sessions), false);
  assert.equal(waitingInSession({}, sessions[1], sessions), false);
});
test('public form links use the patient-facing domain', () => {
  assert.equal(publicFormUrl('valentina-toledo-teste-abc'), 'https://psico.johnvitor.com/valentina-toledo-teste-abc');
});

test('changing the sending session moves the waiting banner to later sessions', () => {
  const instrument = { sent_at: '2026-10-20T10:30:00Z', sent_session_id: 's1' };
  assert.equal(waitingInSession(instrument, sessions[2], sessions), true);
  assert.equal(waitingInSession({ ...instrument, sent_session_id: 's3' }, sessions[2], sessions), false);
  assert.equal(waitingInSession({ ...instrument, sent_session_id: 's3' }, sessions[1], sessions), true);
});
