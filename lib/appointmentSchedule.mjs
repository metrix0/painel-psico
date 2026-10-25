// One-off appointments live in the patient's existing anamnese JSON.
export const HALF_HOUR_TIMES = Object.freeze(Array.from({ length: 48 }, (_, index) =>
  String(Math.floor(index / 2)).padStart(2, "0") + (index % 2 ? ":30" : ":00")));

export function nonRepeating(patient) {
  return patient?.anamnese?.horario_nao_repete === true;
}

export function validScheduleDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function plannedAppointments(patient) {
  if (!nonRepeating(patient)) return [];
  const slots = patient?.anamnese?.sessoes_agendadas;
  if (!Array.isArray(slots)) return [];
  return slots.filter(slot => slot && validScheduleDate(slot.data)).map((slot, index) => ({
    id: String(slot.id || index),
    date: slot.data,
    time: HALF_HOUR_TIMES.includes(slot.horario) ? slot.horario : ""
  }));
}
