"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function readDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]) - 1, day = Number(match[3]);
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date : null;
}

function isoDate(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")].join("-");
}

export default function DatePicker({ label, value, onChange, placeholder = "Selecionar data" }) {
  const root = useRef(null);
  const popup = useRef(null);
  const popupId = useId();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const date = readDate(value) || new Date();
    return { year: date.getFullYear(), month: date.getMonth() };
  });
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const selected = readDate(value);

  useEffect(() => {
    if (!open) return;
    function reposition() {
      const box = root.current?.getBoundingClientRect();
      if (!box) return;
      const top = box.bottom + 6 + 336 > window.innerHeight
        ? Math.max(8, box.top - 342) : box.bottom + 6;
      setPosition({
        top,
        left: Math.max(8, Math.min(box.left, window.innerWidth - 296))
      });
    }
    function dismiss(event) {
      if (!root.current?.contains(event.target) && !popup.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function keydown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        root.current?.querySelector("button")?.focus();
      }
    }
    reposition();
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", keydown);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  function show() {
    if (!open) {
      const date = selected || new Date();
      setView({ year: date.getFullYear(), month: date.getMonth() });
    }
    setOpen(value => !value);
  }

  function shift(delta) {
    const date = new Date(view.year, view.month + delta, 1);
    setView({ year: date.getFullYear(), month: date.getMonth() });
  }

  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const today = isoDate(new Date());

  return <div className="field psico-date-field" ref={root}>
    {label && <span>{label}</span>}
    <button type="button" className={"psico-date-trigger" + (open ? " is-open" : "")}
      aria-label={label || "Selecionar data"} aria-expanded={open} aria-haspopup="dialog"
      aria-controls={open ? popupId : undefined} onClick={show}>
      <span className={selected ? "" : "psico-date-placeholder"}>
        {selected ? selected.toLocaleDateString("pt-BR") : placeholder}
      </span>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
      </svg>
    </button>
    {open && typeof document !== "undefined" && createPortal(
      <div id={popupId} ref={popup} className="psico-calendar" role="dialog"
        aria-label={"Calendário: " + (label || "Data")}
        style={{ top: position.top, left: position.left }}>
        <div className="psico-calendar-head">
          <button type="button" aria-label="Mês anterior" onClick={() => shift(-1)}>‹</button>
          <select aria-label="Mês" value={view.month} onChange={e =>
            setView(prev => ({ ...prev, month: Number(e.target.value) }))}>
            {MONTHS.map((month, index) => <option key={month} value={index}>{month}</option>)}
          </select>
          <input type="number" aria-label="Ano" min="1" max="9999" value={view.year}
            onChange={e => {
              const year = Number(e.target.value);
              if (year >= 1 && year <= 9999) setView(prev => ({ ...prev, year }));
            }} />
          <button type="button" aria-label="Próximo mês" onClick={() => shift(1)}>›</button>
        </div>
        <div className="psico-calendar-days">
          {WEEKDAYS.map(day => <span key={day} className="psico-weekday">{day}</span>)}
          {Array.from({ length: firstWeekday }, (_, i) =>
            <span key={"blank-" + i} aria-hidden="true" />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const date = new Date(view.year, view.month, i + 1);
            const day = isoDate(date);
            return <button key={day} type="button"
              className={(value === day ? " selected" : "") + (today === day ? " today" : "")}
              aria-label={date.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}
              aria-pressed={value === day} onClick={() => { onChange(day); setOpen(false); }}>
              {i + 1}
            </button>;
          })}
        </div>
        <div className="psico-calendar-actions">
          <button type="button" onClick={() => { onChange(""); setOpen(false); }}>Limpar</button>
          <button type="button" onClick={() => { onChange(today); setOpen(false); }}>Hoje</button>
        </div>
      </div>, document.body)}
  </div>;
}
