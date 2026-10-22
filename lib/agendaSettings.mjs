// One hour per slot. Weekdays use JS getDay(): 0 = Sunday, 1 = Monday.
export const DEFAULT_AGENDA_SLOTS = Object.freeze(
  Object.fromEntries(Array.from({ length: 7 }, (_, day) => [
    String(day),
    day === 1 ? [8, 9, 10, 11] : [8, 9, 10, 11, 13, 14, 15]
  ]))
);

export const AGENDA_WEEKDAYS = [
  [1, "Segunda-feira"], [2, "Terça-feira"], [3, "Quarta-feira"],
  [4, "Quinta-feira"], [5, "Sexta-feira"], [6, "Sábado"], [0, "Domingo"]
];

export function normalizeAgendaSlots(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(DEFAULT_AGENDA_SLOTS);
  return Object.fromEntries(Array.from({ length: 7 }, (_, day) => {
    const list = value[String(day)];
    return [String(day), Array.isArray(list)
      ? [...new Set(list.filter(hour => Number.isInteger(hour) && hour >= 0 && hour < 24))].sort((a, b) => a - b)
      : [...DEFAULT_AGENDA_SLOTS[day]]];
  }));
}

export function hourLabel(hour) {
  return String(hour).padStart(2, "0") + ":00";
}

export function slotHoursForDate(schedule, date) {
  const parts = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split("-").map(Number) : null;
  if (!parts) return [];
  const day = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
  return normalizeAgendaSlots(schedule)[String(day)];
}

export function hourFromTime(time) {
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d/.test(time)) return null;
  return Number(time.slice(0, 2));
}
