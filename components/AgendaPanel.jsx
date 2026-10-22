"use client";

import { useState } from "react";
import {
  addDays, agendaWeek, appointmentTime, formatAgendaDate,
  localISO, patientAgenda, weekStart
} from "../lib/agenda.mjs";
import { hourFromTime, hourLabel, slotHoursForDate } from "../lib/agendaSettings.mjs";

const STATUS_LABEL = {
  realizada: "Realizada",
  faltou: "Faltou",
  proxima: "Próxima sessão",
  prevista: "Prevista",
  "sem-registro": "Sem registro"
};

function PatientAvatar({ patient, photoUrl, onOpen }) {
  return <button type="button" className="agenda-avatar" onClick={() => onOpen(patient.id)}
    title={"Abrir " + patient.name} aria-label={"Abrir perfil de " + patient.name}>
    {photoUrl ? <img src={photoUrl} alt="" /> : <span aria-hidden="true">{patient.name.trim().slice(0, 1).toUpperCase() || "?"}</span>}
  </button>;
}

function PatientAppointment({ entry, photoUrl, onOpen }) {
  const { patient, info, status } = entry;
  const [historyOpen, setHistoryOpen] = useState(false);
  return <article className="agenda-appointment">
    <PatientAvatar patient={patient} photoUrl={photoUrl} onOpen={onOpen} />
    <div className="agenda-appointment-body">
      <div className="agenda-appointment-header">
        <button type="button" className="agenda-patient-name" onClick={() => onOpen(patient.id)}>{patient.name}</button>
        <span className={"agenda-status agenda-status-" + status}>{STATUS_LABEL[status]}</span>
      </div>
      <div className="agenda-meta">
        <span>{info.completed} {info.completed === 1 ? "realizada" : "realizadas"}</span>
        <span aria-hidden="true">·</span>
        <span>{info.missed} {info.missed === 1 ? "falta" : "faltas"}</span>
        <span aria-hidden="true">·</span>
        <span>Próxima: {info.next ? formatAgendaDate(info.next, { day: "2-digit", month: "2-digit", year: "numeric" }) : "a definir"}</span>
      </div>
      {info.related.length > 0 && <div className="agenda-history">
        <button type="button" className="agenda-history-toggle" aria-expanded={historyOpen}
          onClick={() => setHistoryOpen(current => !current)}>
          {historyOpen ? "Ocultar histórico" : "Ver histórico"} ({info.related.length})
          <span aria-hidden="true">{historyOpen ? "▴" : "▾"}</span>
        </button>
        {historyOpen && <div className="agenda-history-entries">
          {info.related.map(session => <div key={session.id} className="agenda-history-entry">
            <span>{formatAgendaDate(session.occurred_on, { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
            <strong>{session.title || "Sessão"}</strong>
            <span className={"agenda-status agenda-status-" + (session.occurred_on > localISO() ? "prevista" : session.attendance_status === "faltou" ? "faltou" : "realizada")}>
              {session.occurred_on > localISO() ? "Prevista" : session.attendance_status === "faltou" ? "Faltou" : "Realizada"}
            </span>
          </div>)}
        </div>}
      </div>}
    </div>
  </article>;
}

export default function AgendaPanel({ patients, sessions, schedule, patientPhotoUrls, onOpenPatient, loading, error }) {
  const [monday, setMonday] = useState(() => weekStart(localISO()));
  const [filter, setFilter] = useState("");
  const days = agendaWeek(patients, sessions, monday);
  const normalized = filter.trim().toLocaleLowerCase("pt-BR");
  const shownDays = days.map(day => ({
    ...day,
    appointments: day.appointments.filter(entry => entry.patient.name.toLocaleLowerCase("pt-BR").includes(normalized))
  }));
  const displayed = new Set(shownDays.flatMap(day => day.appointments.map(entry => entry.patient.id)));
  const unscheduled = patients.filter(patient => !patient.anamnese?.consulta_data || !appointmentTime(patient))
    .filter(patient => !displayed.has(patient.id) && patient.name.toLocaleLowerCase("pt-BR").includes(normalized));
  const appointmentsCount = shownDays.reduce((count, day) => count + day.appointments.length, 0);
  const from = formatAgendaDate(monday, { day: "2-digit", month: "short" });
  const to = formatAgendaDate(addDays(monday, 6), { day: "2-digit", month: "short", year: "numeric" });

  return <div className="agenda-page">
    <div className="hero agenda-hero"><div><h1>Agenda</h1><p className="muted">Consultas por dia e horário, com acompanhamento das sessões.</p></div></div>
    <div className="agenda-toolbar">
      <div className="agenda-week-nav">
        <button type="button" className="btn" aria-label="Semana anterior" onClick={() => setMonday(addDays(monday, -7))}>‹</button>
        <strong>{from} – {to}</strong>
        <button type="button" className="btn" aria-label="Próxima semana" onClick={() => setMonday(addDays(monday, 7))}>›</button>
        <button type="button" className="btn soft" onClick={() => setMonday(weekStart(localISO()))}>Hoje</button>
      </div>
      <input type="search" className="agenda-search" aria-label="Buscar paciente na agenda"
        placeholder="Buscar paciente" value={filter} onChange={e => setFilter(e.target.value)} />
    </div>
    {loading && <p className="muted" role="status">Carregando agenda…</p>}
    {error && <p className="notification save-error" role="alert">Não foi possível carregar as sessões da agenda: {error}</p>}
    {!loading && !error && <>
      <p className="agenda-count">{appointmentsCount} {appointmentsCount === 1 ? "consulta" : "consultas"} nesta semana</p>
      <div className="agenda-days">
        {shownDays.map(day => {
          const configured = slotHoursForDate(schedule, day.date);
          const occupiedHours = day.appointments.map(entry => hourFromTime(entry.info.time)).filter(hour => hour !== null);
          const hours = [...new Set([...configured, ...occupiedHours])].sort((a, b) => a - b);
          return <section className="agenda-day card" key={day.date}>
            <div className="agenda-day-header">
              <h2>{formatAgendaDate(day.date, { weekday: "long", day: "2-digit", month: "long" })}</h2>
              <span>{day.appointments.length} {day.appointments.length === 1 ? "consulta" : "consultas"}</span>
            </div>
            <div className="agenda-day-list">
              {!hours.length && <div className="agenda-no-hours">Sem horários de atendimento configurados.</div>}
              {hours.map(hour => {
                const scheduled = configured.includes(hour);
                const entries = day.appointments.filter(entry => hourFromTime(entry.info.time) === hour);
                return <div className="agenda-hour-block" key={hour}>
                  <div className="agenda-hour-label">
                    <strong>{hourLabel(hour)}</strong>
                    {!scheduled && <small>Fora do horário</small>}
                  </div>
                  <div className="agenda-hour-content">
                    {entries.length
                      ? entries.map(entry => <PatientAppointment key={entry.patient.id + ":" + day.date}
                          entry={entry} photoUrl={patientPhotoUrls[entry.patient.id]} onOpen={onOpenPatient} />)
                      : <span className="agenda-empty-slot">Vazio</span>}
                  </div>
                </div>;
              })}
            </div>
          </section>;
        })}
      </div>
      {unscheduled.length > 0 && <section className="agenda-unplanned card">
        <div className="agenda-day-header"><h2>Sem dia ou horário definido</h2><span>{unscheduled.length} pacientes</span></div>
        <p className="muted agenda-unplanned-note">Defina o dia e horário da consulta na Anamnese para incluí-los na agenda semanal.</p>
        <div className="agenda-unplanned-list">
          {unscheduled.map(patient => {
            const info = patientAgenda(patient, sessions);
            return <div className="agenda-unplanned-patient" key={patient.id}>
              <PatientAvatar patient={patient} photoUrl={patientPhotoUrls[patient.id]} onOpen={onOpenPatient} />
              <div><button type="button" className="agenda-patient-name" onClick={() => onOpenPatient(patient.id)}>{patient.name}</button>
                <div className="agenda-meta">{info.completed} realizadas · {info.missed} faltas</div></div>
            </div>;
          })}
        </div>
      </section>}
    </>}
  </div>;
}
