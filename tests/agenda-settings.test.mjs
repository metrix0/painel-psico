import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_AGENDA_SLOTS, normalizeAgendaSlots, slotHoursForDate, hourLabel, hourFromTime} from "../lib/agendaSettings.mjs";
import {patientAgenda, agendaWeek, localISO} from "../lib/agenda.mjs";

test("default working hours: Monday morning, other six days morning and afternoon", () => {
  assert.deepEqual(DEFAULT_AGENDA_SLOTS[1], [8,9,10,11]);
  for (const day of [0,2,3,4,5,6]) assert.deepEqual(DEFAULT_AGENDA_SLOTS[day], [8,9,10,11,13,14,15]);
  assert.deepEqual(slotHoursForDate(DEFAULT_AGENDA_SLOTS,"2026-10-19"),[8,9,10,11]);
  assert.deepEqual(slotHoursForDate(DEFAULT_AGENDA_SLOTS,"2026-10-20"),[8,9,10,11,13,14,15]);
});
test("hours display as 08:00, 09:00, including 1-hour skips", () => {
  assert.equal(hourLabel(8),"08:00");
  assert.equal(hourLabel(9),"09:00");
  assert.equal(hourLabel(13),"13:00");
  assert.equal(hourFromTime("09:30"),9);
  assert.equal(hourFromTime("invalid"),null);
});
test("all seven days remain available and zero-hour days are respected", () => {
  const normalized=normalizeAgendaSlots({"1":[9,9,8,25,-1],"0":[],"2":[],"3":[],"4":[],"5":[],"6":[]});
  assert.deepEqual(normalized[1],[8,9]);
  assert.deepEqual(normalized[0],[]);
  const week=agendaWeek([],[],"2026-10-19");
  assert.equal(week.length,7);
  assert.deepEqual(week.map(d=>d.appointments.length),[0,0,0,0,0,0,0]);
});
test("next weekly appointment is derived from Anamnese time/day without future sessions", () => {
  const patient={id:"p",name:"Teste",anamnese:{consulta_data:"2026-10-07",consulta_horario:"09:00"}};
  const before=new Date(2026,9,21,8,0);
  assert.equal(patientAgenda(patient,[],before).next,"2026-10-21");
  const after=new Date(2026,9,21,10,0);
  assert.equal(patientAgenda(patient,[],after).next,"2026-10-28");
  assert.equal(patientAgenda(patient,[],after).time,"09:00");
});
