"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

const TABLES = {
  patient: "psico_patients",
  report_settings: "psico_report_settings",
  agenda_settings: "psico_agenda_settings",
  session: "psico_sessions",
  session_field: "psico_session_fields",
  anamnese_template: "psico_anamnese_templates",
  instrument: "psico_instruments",
  instrument_template: "psico_instrument_templates"
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// One serialized writer per record. New edits are never overwritten by an older request.
export function useAutosave() {
  const baselines = useRef(new Map());
  const drafts = useRef(new Map());
  const timers = useRef(new Map());
  const requests = useRef(new Map());
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");

  const refresh = useCallback(() => setRevision(n => n + 1), []);

  const isPending = useCallback(() => {
    if (requests.current.size) return true;
    for (const [key, entry] of drafts.current) {
      if (entry.serialized !== baselines.current.get(key)) return true;
    }
    return false;
  }, []);

  const flush = useCallback(async function persist(key) {
    const timer = timers.current.get(key);
    if (timer) clearTimeout(timer);
    timers.current.delete(key);

    const inflight = requests.current.get(key);
    if (inflight) {
      if (!await inflight) return false;
      return persist(key);
    }

    const entry = drafts.current.get(key);
    if (!entry || entry.serialized === baselines.current.get(key)) return true;
    const [kind, id] = key.split(":");
    if (!TABLES[kind] || !id) return false;

    if (kind === "patient" && !entry.data.name.trim()) {
      setError("O nome do paciente não pode ficar vazio.");
      return false;
    }
    if (kind === "session" && (
      !entry.data.occurred_on ||
      !Number.isFinite(Number(entry.data.duration_minutes)) ||
      Number(entry.data.duration_minutes) < 0 ||
      Number(entry.data.duration_minutes) > 1440
    )) {
      setError("Verifique a data e a duração da sessão.");
      return false;
    }

    const snapshot = clone(entry.data);
    const serialized = entry.serialized;
    const task = (async () => {
      try {
        const { data, error: saveError } = await supabase.from(TABLES[kind])
          .update(snapshot).eq("id", id).select("id").maybeSingle();
        if (saveError || !data) throw new Error(saveError?.message || "Registro não encontrado.");
        baselines.current.set(key, serialized);
        setError("");
        return true;
      } catch (err) {
        setError("Não foi possível salvar: " + (err?.message || "erro desconhecido"));
        return false;
      }
    })();

    requests.current.set(key, task);
    refresh();
    try {
      const ok = await task;
      return ok;
    } finally {
      if (requests.current.get(key) === task) requests.current.delete(key);
      refresh();
      const current = drafts.current.get(key);
      if (current && current.serialized !== baselines.current.get(key) &&
          baselines.current.get(key) === serialized) {
        // A newer edit arrived during the request: save that edit too.
        setTimeout(() => { void persist(key); }, 0);
      }
    }
  }, [refresh]);

  const track = useCallback((key, data) => {
    const snapshot = clone(data);
    drafts.current.set(key, { data: snapshot, serialized: JSON.stringify(snapshot) });
    setError("");
    const timer = timers.current.get(key);
    if (timer) clearTimeout(timer);
    timers.current.set(key, setTimeout(() => { void flush(key); }, 800));
    refresh();
  }, [flush, refresh]);

  const register = useCallback((key, data) => {
    const timer = timers.current.get(key);
    if (timer) clearTimeout(timer);
    timers.current.delete(key);
    const snapshot = clone(data);
    const serialized = JSON.stringify(snapshot);
    drafts.current.set(key, { data: snapshot, serialized });
    baselines.current.set(key, serialized);
    refresh();
  }, [refresh]);

  const forget = useCallback((key) => {
    const timer = timers.current.get(key);
    if (timer) clearTimeout(timer);
    timers.current.delete(key);
    drafts.current.delete(key);
    baselines.current.delete(key);
    refresh();
  }, [refresh]);

  const flushAll = useCallback(async () => {
    const keys = [...new Set([...drafts.current.keys(), ...requests.current.keys()])];
    const result = await Promise.all(keys.map(key => flush(key)));
    // Flush once more if something changed while earlier writes were in flight.
    if (result.every(Boolean)) {
      const rest = [...drafts.current.entries()].filter(([key, entry]) =>
        entry.serialized !== baselines.current.get(key));
      if (rest.length) return (await Promise.all(rest.map(([key]) => flush(key)))).every(Boolean);
      return true;
    }
    return false;
  }, [flush]);

  useEffect(() => {
    const beforeUnload = event => {
      if (isPending()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && isPending()) void flushAll();
    };
    const onOnline = () => { if (isPending()) void flushAll(); };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [flushAll, isPending]);

  // Read ref state on every render. Revision forces a repaint on save lifecycle updates.
  void revision;
  const pending = isPending();
  const saving = requests.current.size > 0;
  const status = error && pending ? "error" : saving ? "saving" : pending ? "pending" : "saved";

  return { track, register, forget, flush, flushAll, isPending, status, error };
}
