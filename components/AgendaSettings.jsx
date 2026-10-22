"use client";

import { useState } from "react";
import { AGENDA_WEEKDAYS, hourLabel, normalizeAgendaSlots } from "../lib/agendaSettings.mjs";

export default function AgendaSettings({ slots, onChange, loading }) {
  const [showAllHours, setShowAllHours] = useState(false);
  const schedule = normalizeAgendaSlots(slots);
  const defaultVisible = Array.from({ length: 14 }, (_, i) => i + 7);
  return <section className="card agenda-settings">
    <div className="cardhead"><h2>Configurar Agenda</h2></div>
    <div className="cardbody">
      <p className="muted">Selecione os horários de atendimento para cada dia. Cada bloco corresponde a 1 hora. Alterações salvas automaticamente.</p>
      <button type="button" className="text-btn agenda-settings-expand"
        onClick={() => setShowAllHours(value => !value)}>
        {showAllHours ? "Mostrar horários principais" : "Mostrar todas as 24 horas"}
      </button>
      {loading ? <p className="muted" role="status">Carregando horários…</p>
      : <div className="agenda-settings-days">
        {AGENDA_WEEKDAYS.map(([day, label]) => {
          const current = schedule[String(day)];
          const visibleHours = showAllHours
            ? Array.from({ length: 24 }, (_, hour) => hour)
            : [...new Set([...defaultVisible, ...current])].sort((a, b) => a - b);
          return <div key={day} className="agenda-settings-day">
            <div className="agenda-settings-day-head">
              <strong>{label}</strong>
              <span>{current.length ? current.length + (current.length === 1 ? " hora" : " horas") : "Sem atendimento"}</span>
            </div>
            <div className="agenda-settings-hours" role="group" aria-label={"Horários de " + label}>
              {visibleHours.map(hour => {
                const selected = current.includes(hour);
                return <button type="button" key={hour} className={"agenda-settings-hour" + (selected ? " selected" : "")}
                  aria-pressed={selected} title={hourLabel(hour) + "–" + hourLabel((hour + 1) % 24)}
                  onClick={() => {
                    const next = selected ? current.filter(value => value !== hour) : [...current, hour].sort((a, b) => a - b);
                    onChange({ ...schedule, [day]: next });
                  }}>
                  {hourLabel(hour)}
                </button>;
              })}
            </div>
          </div>;
        })}
      </div>}
    </div>
  </section>;
}
