// Calendar dates stay as YYYY-MM-DD to avoid shifting clinical dates across time zones.
import { nonRepeating, plannedAppointments } from "./appointmentSchedule.mjs";
const DAY_MS = 86_400_000;

export function dateParts(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() + 1 !== month || utc.getUTCDate() !== day) return null;
  return { year, month, day };
}

function utcDate(iso) {
  const p = dateParts(iso);
  return p ? new Date(Date.UTC(p.year, p.month - 1, p.day)) : null;
}

export function localISO(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function addDays(iso, count) {
  const date = utcDate(iso);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function weekStart(iso) {
  const date = utcDate(iso);
  return date ? addDays(iso, -((date.getUTCDay() + 6) % 7)) : null;
}

export function dayDifference(from, to) {
  const start = utcDate(from);
  const end = utcDate(to);
  return start && end ? Math.round((end - start) / DAY_MS) : null;
}

export function isWeeklyOccurrence(firstDate, targetDate) {
  const days = dayDifference(firstDate, targetDate);
  return days !== null && days >= 0 && days % 7 === 0;
}

export function appointmentTime(patient) {
  const value = patient?.anamnese?.consulta_horario;
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d/.test(value) ? value.slice(0, 5) : "";
}

export function nextWeeklyDate(firstDate, time, now = new Date()) {
  if (!dateParts(firstDate)) return null;
  const today = localISO(now);
  if (firstDate > today) return firstDate;
  const elapsed = dayDifference(firstDate, today);
  let date = addDays(firstDate, Math.ceil(elapsed / 7) * 7);
  if (date === today && time) {
    const [hour, minute] = time.split(":").map(Number);
    const appointment = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
    if (now > appointment) date = addDays(date, 7);
  } else if (date === today && !time) {
    // Without a time, the patient remains on today's schedule.
  }
  return date;
}

export function isProfessionalAbsence(session) {
  return session?.custom_fields?.tipo_ocorrencia === "ausencia_profissional";
}

export function patientAgenda(patient, sessions = [], now = new Date()) {
  const related = sessions.filter(session => session.patient_id === patient.id);
  const today = localISO(now);
  const completed = related.filter(s => s.attendance_status === "realizada" && !isProfessionalAbsence(s) && s.occurred_on <= today);
  const missed = related.filter(s => s.attendance_status === "faltou" && !isProfessionalAbsence(s) && s.occurred_on <= today);
  const firstDate = patient.anamnese?.consulta_data || "";
  const irregular = nonRepeating(patient);
  const time = irregular ? "" : appointmentTime(patient);
  const recurring = !irregular && time ? nextWeeklyDate(firstDate, time, now) : null;
  const futurePlanned = irregular ? plannedAppointments(patient)
    .filter(slot => slot.date > today || (slot.date === today && (!slot.time ||
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(slot.time.slice(0, 2)),
        Number(slot.time.slice(3, 5))) >= now)))
    .map(slot => slot.date).sort()[0] : null;
  const futureRecorded = related.filter(s => s.occurred_on > today).map(s => s.occurred_on).sort()[0];
  const next = [recurring, futurePlanned, futureRecorded].filter(Boolean).sort()[0] || null;
  return {
    related: [...related].sort((a, b) => (b.occurred_on || "").localeCompare(a.occurred_on || "") || (b.created_at || "").localeCompare(a.created_at || "")),
    completed: completed.length,
    missed: missed.length,
    firstDate,
    time,
    next
  };
}

export function agendaWeek(patients, sessions, monday, now = new Date()) {
  const today = localISO(now);
  const byPatient = new Map();
  for (const session of sessions) {
    if (!byPatient.has(session.patient_id)) byPatient.set(session.patient_id, []);
    byPatient.get(session.patient_id).push(session);
  }
  return Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(monday, offset);
    const appointments = [];
    for (const patient of patients) {
      const info = patientAgenda(patient, byPatient.get(patient.id) || [], now);
      const onDate = info.related.filter(s => s.occurred_on === date);
      const planned = nonRepeating(patient)
        ? plannedAppointments(patient).filter(slot => slot.date === date)
        : info.time && isWeeklyOccurrence(info.firstDate, date)
          ? [{ id: "weekly", date, time: info.time }] : [];
      // Clinical session records remain visible even if no appointment was planned.
      if (!planned.length && onDate.length) planned.push({ id: "recorded", date, time: "" });
      const status = onDate.some(s => s.attendance_status === "realizada" && !isProfessionalAbsence(s))
        ? (date <= today ? "realizada" : "prevista")
        : onDate.some(s => s.attendance_status === "faltou" && !isProfessionalAbsence(s))
          ? (date <= today ? "faltou" : "prevista")
          : onDate.some(isProfessionalAbsence)
            ? "profissional-ausente"
            : date < today ? "sem-registro" : info.next === date ? "proxima" : "prevista";
      for (const slot of planned) {
        appointments.push({ patient, info, onDate, status, date, time: slot.time,
          key: patient.id + ":" + date + ":" + slot.id });
      }
    }
    appointments.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99") ||
      a.patient.name.localeCompare(b.patient.name, "pt-BR"));
    return { date, appointments };
  });
}

export function formatAgendaDate(iso, options = { day: "2-digit", month: "short" }) {
  const date = utcDate(iso);
  return date ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...options }).format(date) : "A definir";
}
