import test from "node:test";
import assert from "node:assert/strict";
import { agendaWeek, nextWeeklyDate, patientAgenda, weekStart, localISO } from "../lib/agenda.mjs";

const patient = {id: "p1", name: "Valentina", anamnese: { consulta_data: "2026-10-07", consulta_horario: "09:00" }};
const clock = new Date(2026, 9, 21, 8, 30);
const makeSession = (number, date, status = "realizada") =>
  ({ id: "s" + number, patient_id: "p1", title: "Sessão " + number, occurred_on: date, attendance_status: status });

test("weekly visit follows the original date and time", () => {
  assert.equal(weekStart("2026-10-21"), "2026-10-19");
  assert.equal(nextWeeklyDate("2026-10-07", "09:00", clock), "2026-10-21");
  assert.equal(nextWeeklyDate("2026-10-07", "09:00", new Date(2026, 9, 21, 9, 1)), "2026-10-28");
});
test("all sessions are retained, never capped at twelve", () => {
  const sessions = Array.from({length: 16}, (_, i) => makeSession(i, "2026-10-14"));
  const info = patientAgenda(patient, sessions, clock);
  assert.equal(info.related.length, 16);
  assert.equal(info.completed, 16);
});
test("only explicit missed sessions count as absences", () => {
  const sessions = [makeSession(1, "2026-10-07"), makeSession(2, "2026-10-14", "faltou")];
  const info = patientAgenda(patient, sessions, clock);
  assert.equal(info.completed, 1);
  assert.equal(info.missed, 1);
  const week = agendaWeek([patient], sessions, "2026-10-12", clock);
  assert.equal(week[2].appointments[0].status, "faltou");
  const previous = agendaWeek([patient], [], "2026-10-12", clock);
  assert.equal(previous[2].appointments[0].status, "sem-registro");
});
test("agenda displays recurring patients and ad hoc recorded sessions", () => {
  const second = { id: "p2", name: "Teste", anamnese: {} };
  const week = agendaWeek([patient, second], [makeSession(1,"2026-10-21"), {id:"s2",patient_id:"p2",occurred_on:"2026-10-20"}], "2026-10-19", clock);
  assert.equal(week[1].appointments[0].patient.id, "p2");
  assert.equal(week[2].appointments[0].patient.id, "p1");
  assert.equal(week[2].appointments[0].status, "realizada");
  assert.equal(localISO(clock), "2026-10-21");
});
