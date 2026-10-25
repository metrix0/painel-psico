import test from "node:test";
import assert from "node:assert/strict";
import { agendaWeek, nextWeeklyDate, patientAgenda, weekStart, localISO } from "../lib/agenda.mjs";
import {
  hourLabel, nextConsultationDateForWeekday, slotHoursForDate, weekdayFromConsultationDate
} from "../lib/agendaSettings.mjs";

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


test("weekday selection preserves weekly recurrence using a next-weekday date anchor", () => {
  assert.equal(weekdayFromConsultationDate("2026-10-07"), "3");
  assert.equal(weekdayFromConsultationDate(""), "");
  assert.equal(nextConsultationDateForWeekday("3", "2026-10-21"), "2026-10-21");
  assert.equal(nextConsultationDateForWeekday("1", "2026-10-21"), "2026-10-26");
  assert.equal(nextConsultationDateForWeekday("0", "2026-10-21"), "2026-10-25");
  assert.equal(nextConsultationDateForWeekday("", "2026-10-21"), "");
  const recurring = {...patient, anamnese: {consulta_data: nextConsultationDateForWeekday("1", "2026-10-21"), consulta_horario: "08:00"}};
  assert.equal(agendaWeek([recurring], [], "2026-10-26", clock)[0].appointments.length, 1);
});

test("appointment times use only the selected weekday slots in whole-hour increments", () => {
  const slots = {"1": [8, 10, 15], "2": [9, 11]};
  assert.deepEqual(slotHoursForDate(slots, "2026-10-26").map(hourLabel), ["08:00", "10:00", "15:00"]);
  assert.deepEqual(slotHoursForDate(slots, "2026-10-27").map(hourLabel), ["09:00", "11:00"]);
  assert.equal(slotHoursForDate({"1": []}, "2026-10-26").length, 0);
});

test("non-repeating dates can use any half-hour and never create weekly ghost slots", async () => {
  const { HALF_HOUR_TIMES, plannedAppointments } = await import("../lib/appointmentSchedule.mjs");
  assert.equal(HALF_HOUR_TIMES.length, 48);
  assert.equal(HALF_HOUR_TIMES[0], "00:00");
  assert.equal(HALF_HOUR_TIMES[19], "09:30");
  assert.equal(HALF_HOUR_TIMES[47], "23:30");
  const irregular = { id: "p3", name: "Irregular", anamnese: {
    horario_nao_repete: true, consulta_data: "2026-10-19", consulta_horario: "08:00",
    sessoes_agendadas: [
      { id: "a", data: "2026-10-20", horario: "09:30" },
      { id: "b", data: "2026-10-22", horario: "" },
      { id: "draft", data: "", horario: "16:00" }
    ]
  } };
  assert.equal(plannedAppointments(irregular).length, 2);
  const week = agendaWeek([irregular], [], "2026-10-19", clock);
  assert.deepEqual(week.map(day => day.appointments.length), [0, 1, 0, 1, 0, 0, 0]);
  assert.equal(week[1].appointments[0].time, "09:30");
  assert.equal(week[3].appointments[0].time, "");
  const nextWeek = agendaWeek([irregular], [], "2026-10-26", clock);
  assert.equal(nextWeek.flatMap(day => day.appointments).length, 0);
  assert.equal(patientAgenda(irregular, [], clock).next, "2026-10-22");
  assert.equal(agendaWeek([irregular], [makeSession(1, "2026-10-23")], "2026-10-19", clock)[4].appointments[0].time, "");
});
test("two sessions on same day show separately and unscheduled times appear last", () => {
  const irregular = { id: "p4", name: "Vera", anamnese: {
    horario_nao_repete: true,
    sessoes_agendadas: [
      { id: "1", data: "2026-10-21", horario: "10:30" },
      { id: "2", data: "2026-10-21", horario: "" },
      { id: "3", data: "2026-10-21", horario: "08:00" }
    ]
  } };
  const appointments = agendaWeek([irregular], [], "2026-10-19", clock)[2].appointments;
  assert.deepEqual(appointments.map(a => a.time), ["08:00", "10:30", ""]);
  assert.equal(new Set(appointments.map(a => a.key)).size, 3);
});
test("legacy weekly appointment stays unchanged when irregular flag is absent or false", () => {
  const off = { ...patient, anamnese: {
    ...patient.anamnese, horario_nao_repete: false,
    sessoes_agendadas: [{ id: "ignore", data: "2026-10-20", horario: "09:30" }]
  } };
  const week = agendaWeek([off], [], "2026-10-19", clock);
  assert.deepEqual(week.map(day => day.appointments.length), [0, 0, 1, 0, 0, 0, 0]);
  assert.equal(week[2].appointments[0].time, "09:00");
});
