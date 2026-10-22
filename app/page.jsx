"use client";

import { useEffect, useRef, useState } from "react";
import { configured, supabase } from "../lib/supabase";
import { useAutosave } from "../lib/useAutosave";
import QuestionAnswerInput from "../components/QuestionAnswerInput";
import { patientAnamneseSnapshot, selectPatientAnamnese } from "../lib/anamneseVersions.mjs";
import SidebarIcon from "../components/SidebarIcon";
import { InstrumentTable, TableEditor } from "../components/InstrumentTables";
import { createTable, instantiateTables } from "../lib/instrumentTables.mjs";
import InstrumentFormEditor from "../components/InstrumentFormEditor";
import ChoiceOptionsEditor from "../components/ChoiceOptionsEditor";
import { DEFAULT_CHOICES, newChoiceQuestion, typeChange } from "../lib/questionDefaults.mjs";
import InstrumentDelivery from "../components/InstrumentDelivery";
import ReportPanel from "../components/ReportPanel";
import ReportSettings from "../components/ReportSettings";
import DatePicker from "../components/DatePicker";
import AgendaPanel from "../components/AgendaPanel";
import AgendaSettings from "../components/AgendaSettings";
import {
  AGENDA_WEEKDAYS, DEFAULT_AGENDA_SLOTS, hourLabel, nextConsultationDateForWeekday,
  normalizeAgendaSlots, slotHoursForDate, weekdayFromConsultationDate
} from "../lib/agendaSettings.mjs";
import { localISO } from "../lib/agenda.mjs";
import { DEFAULT_REPORT_SETTINGS } from "../supabase/functions/_shared/reportCore.mjs";
import { deliveryDate, instrumentForm, waitingInSession } from "../lib/instrumentDelivery.mjs";

const EMPTY_ANAMNESE = {
  motivo: "",
  desenvolvimento: "",
  comportamento: "",
  social: "",
  escola: "",
  medico: "",
  familiar: "",
  rotina: ""
};

const AREAS = [
  ["motivo", "Motivo da avaliação"],
  ["desenvolvimento", "Gestação, nascimento e desenvolvimento"],
  ["comportamento", "Comportamento e regulação emocional"],
  ["social", "Interação social e comunicação"],
  ["escola", "Contexto escolar"],
  ["medico", "Histórico médico"],
  ["familiar", "Histórico familiar"],
  ["rotina", "Sono, alimentação e rotina"]
];

const formatDate = (value) => {
  if (!value) return "—";
  const parts = value.split("-");
  return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : value;
};

function formatAge(birthDate) {
  if (!birthDate) return null;
  const [year, month, day] = birthDate.split("-").map(Number);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const today = new Date();
  let years = today.getFullYear() - year;
  let months = (today.getMonth() + 1) - month;
  if (today.getDate() < day) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years < 0) return null;
  return `${years} ${years === 1 ? "ano" : "anos"} ${months} ${months === 1 ? "mês" : "meses"}`;
}

function InputField({ label, value, onChange, type = "text", placeholder = "" }) {
  if (type === "date") return <DatePicker label={label} value={value || ""} onChange={onChange} placeholder={placeholder || "Selecionar data"} />;
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value || ""} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </label>
  );
}



function patientPayload(patient) {
  return {
    name: patient.name,
    birth_date: patient.birth_date || null,
    grade: patient.grade || "",
    school: patient.school || "",
    guardian: patient.guardian || "",
    requester: patient.requester || "",
    anamnese: patient.anamnese || {},
    anamnese_template_id: patient.anamnese_template_id || null,
    conclusion: patient.conclusion || ""
  };
}

function sessionPayload(session) {
  return {
    occurred_on: session.occurred_on,
    attendance_status: session.attendance_status || "realizada",
    duration_minutes: Number(session.duration_minutes),
    title: session.title || "",
    notes: session.notes || "",
    custom_fields: session.custom_fields || {}
  };
}

function sessionFieldPayload(field) {
  return {
    label: field.label || "",
    field_type: field.field_type,
    options: field.options || [],
    position: field.position
  };
}

function SessionCustomFields({ sessionId, fields, values, onChange }) {
  if (!fields.length) return null;
  return <div className="session-custom-fields">
    {fields.map(field => <QuestionAnswerInput
      key={field.id}
      field={field}
      value={values?.[field.id]}
      namePrefix={"session-" + sessionId}
      onChange={value => onChange(field.id, value)}
    />)}
  </div>;
}

function anamneseTemplatePayload(template) {
  return {
    name: template.name || "",
    questions: template.questions || []
  };
}

function hasLegacyAnamnese(answers) {
  return AREAS.some(([key]) => Boolean(answers?.[key]?.trim()));
}

function instrumentPayload(instrument) {
  return {
    name: instrument.name || "",
    category: instrument.category || "",
    status: instrument.status || "Pendente",
    notes: instrument.notes || "",
    session_id: instrument.session_id || null,
    tables: instrument.tables || []
  };
}

function templatePayload(template) {
  return { name: template.name || "", category: template.category || "", tables: template.tables || [], form_questions: template.form_questions ?? null };
}

function AnimatedSelect({ label, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    function dismiss(event) {
      if (root.current && !root.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  return (
    <div className={"field animated-select" + (open ? " is-open" : "")} ref={root}
      onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
      <span>{label}</span>
      <button type="button" className="select-trigger" aria-haspopup="listbox"
        aria-expanded={open} onClick={() => setOpen(current => !current)}>
        <span>{value}</span>
        <svg className="select-chevron" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div className="select-reveal" aria-hidden={!open}>
        <div className="select-reveal-inner">
          <div className="select-options" role="listbox" aria-label={label}>
            {options.map(option => (
              <button key={option} type="button" role="option" aria-selected={value === option}
                tabIndex={open ? 0 : -1}
                className={value === option ? "selected" : ""}
                onClick={() => { onChange(option); setOpen(false); }}>
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordSetup, setPasswordSetup] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [patients, setPatients] = useState([]);
  const [agendaSessions, setAgendaSessions] = useState([]);
  const [agendaSlots, setAgendaSlots] = useState(DEFAULT_AGENDA_SLOTS);
  const [agendaSettingsLoading, setAgendaSettingsLoading] = useState(true);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaError, setAgendaError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [anamneseTemplates, setAnamneseTemplates] = useState([]);
  const [anamneseTemplatesLoading, setAnamneseTemplatesLoading] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [sessionFields, setSessionFields] = useState([]);
  const [sessionFieldsLoading, setSessionFieldsLoading] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState({});
  const [instruments, setInstruments] = useState([]);
  const [reportSettings, setReportSettings] = useState(null);
  const [instrumentTemplates, setInstrumentTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [tab, setTab] = useState("anamnese");
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const [patientPhotoUrls, setPatientPhotoUrls] = useState({});
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef(null);
  const autosave = useAutosave();
  const switchingPatient = useRef(false);
  const deliveryRevision = useRef(0);
  const deliveryActionInFlight = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const searchParams = new URLSearchParams(window.location.search);
    if (["invite", "recovery"].includes(params.get("type") || searchParams.get("type"))) {
      setPasswordSetup(true);
    }
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getUser().then(({ data, error }) => {
      if (error && !/Auth session missing/i.test(error.message)) setNotice(error.message);
      setUser(data?.user || null);
      setAuthLoading(false);
    }).catch(err => {
      setNotice(err.message);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, authSession) => {
      setUser(authSession?.user || null);
      if (event === "PASSWORD_RECOVERY") setPasswordSetup(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const patientIds = patients.map(patient => patient.id).join(",");

  useEffect(() => {
    let active = true;
    setPatientPhotoUrls({});
    if (!user?.id || !supabase || !patients.length) return;
    const storage = supabase.storage.from("psico-patient-photos");
    void Promise.all(patients.map(async patient => {
      const path = user.id + "/" + patient.id + "/photo";
      const { data, error } = await storage.createSignedUrl(path, 3600);
      return [patient.id, !error ? data?.signedUrl : null];
    })).then(entries => {
      if (active) setPatientPhotoUrls(Object.fromEntries(entries.filter(([, url]) => Boolean(url))));
    });
    return () => { active = false; };
  }, [user?.id, patientIds]);

  async function uploadPatientPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user?.id || !selectedId) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setNotice("Escolha uma foto JPG, PNG ou WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotice("A foto deve ter até 2 MB.");
      return;
    }
    const patientId = selectedId;
    const path = user.id + "/" + patientId + "/photo";
    setPhotoUploading(true);
    try {
      const bucket = supabase.storage.from("psico-patient-photos");
      const { error: uploadError } = await bucket.upload(path, file, {
        cacheControl: "60",
        contentType: file.type,
        upsert: true
      });
      if (uploadError) throw uploadError;
      const { data, error: urlError } = await bucket.createSignedUrl(path, 3600);
      if (urlError || !data?.signedUrl) throw urlError || new Error("Foto indisponível.");
      setPatientPhotoUrls(prev => ({ ...prev, [patientId]: data.signedUrl + "&v=" + Date.now() }));
      setNotice("Foto do paciente atualizada.");
    } catch (error) {
      setNotice("Não foi possível salvar a foto: " + (error?.message || "erro desconhecido"));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function removePatientPhoto() {
    if (!user?.id || !selectedId || !patientPhotoUrls[selectedId]) return;
    const patientId = selectedId;
    setPhotoUploading(true);
    const { error } = await supabase.storage.from("psico-patient-photos")
      .remove([user.id + "/" + patientId + "/photo"]);
    if (error) setNotice("Não foi possível remover a foto: " + error.message);
    else {
      setPatientPhotoUrls(prev => { const next = { ...prev }; delete next[patientId]; return next; });
      setNotice("Foto do paciente removida.");
    }
    setPhotoUploading(false);
  }

  useEffect(() => {
    if (!user || !supabase) {
      setPatients([]);
      setSelectedId(null);
      setForm(null);
      return;
    }
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase.from("psico_patients").select("*").order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) { setNotice(error.message); return; }
      const rows = data || [];
      setPatients(rows);
      const recent = [...rows].sort((a, b) =>
        Date.parse(b.last_visited_at || b.created_at) - Date.parse(a.last_visited_at || a.created_at));
      setSelectedId(prev => rows.some(p => p.id === prev) ? prev : (recent[0]?.id || null));
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !supabase) {
      setAnamneseTemplates([]);
      setEditingTemplateId(null);
      return;
    }
    let cancelled = false;
    setAnamneseTemplatesLoading(true);
    async function loadTemplates() {
      const { data, error } = await supabase.from("psico_anamnese_templates")
        .select("*").order("created_at", { ascending: true });
      if (cancelled) return;
      setAnamneseTemplatesLoading(false);
      if (error) { setNotice(error.message); return; }
      const rows = data || [];
      rows.forEach(template => autosave.register("anamnese_template:" + template.id, anamneseTemplatePayload(template)));
      setAnamneseTemplates(rows);
      setEditingTemplateId(prev => rows.some(t => t.id === prev && !t.archived)
        ? prev : (rows.find(t => !t.archived)?.id || null));
    }
    void loadTemplates();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !supabase) {
      setSessionFields([]);
      return;
    }
    let cancelled = false;
    setSessionFieldsLoading(true);
    async function loadSessionFields() {
      const { data, error } = await supabase.from("psico_session_fields")
        .select("*").order("position", { ascending: true }).order("created_at", { ascending: true });
      if (cancelled) return;
      setSessionFieldsLoading(false);
      if (error) { setNotice(error.message); return; }
      for (const field of data || []) autosave.register("session_field:" + field.id, sessionFieldPayload(field));
      setSessionFields(data || []);
    }
    void loadSessionFields();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    setReportSettings(null);
    if (!user?.id || !supabase) return;
    let cancelled = false;
    async function loadReportSettings() {
      let { data, error } = await supabase.from("psico_report_settings").select("settings").eq("id", user.id).maybeSingle();
      if (!error && !data) {
        const created = await supabase.from("psico_report_settings").upsert({ id: user.id, settings: DEFAULT_REPORT_SETTINGS }, { onConflict: "id", ignoreDuplicates: true }).select("settings").maybeSingle();
        error = created.error; data = created.data;
        if (!error && !data) ({data,error}=await supabase.from("psico_report_settings").select("settings").eq("id",user.id).single());
      }
      if (cancelled) return;
      if (error) { setNotice("Não foi possível carregar a configuração de laudos: " + error.message); return; }
      const settings = { ...DEFAULT_REPORT_SETTINGS, ...(data?.settings || {}) };
      autosave.register("report_settings:" + user.id, {settings});
      setReportSettings(settings);
    }
    void loadReportSettings();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !supabase) {
      setAgendaSlots(DEFAULT_AGENDA_SLOTS);
      setAgendaSettingsLoading(false);
      return;
    }
    let cancelled = false;
    setAgendaSettingsLoading(true);
    async function loadAgendaSettings() {
      try {
        let { data, error } = await supabase.from("psico_agenda_settings")
          .select("slots").eq("id", user.id).maybeSingle();
        if (error) throw error;
        if (!data) {
          const inserted = await supabase.from("psico_agenda_settings")
            .upsert({id: user.id, slots: DEFAULT_AGENDA_SLOTS},
              {onConflict: "id", ignoreDuplicates: true}).select("slots").maybeSingle();
          if (inserted.error) throw inserted.error;
          data = inserted.data;
          if (!data) {
            const retrieved = await supabase.from("psico_agenda_settings")
              .select("slots").eq("id", user.id).single();
            if (retrieved.error) throw retrieved.error;
            data = retrieved.data;
          }
        }
        if (cancelled) return;
        const slots = normalizeAgendaSlots(data?.slots);
        autosave.register("agenda_settings:" + user.id, {slots});
        setAgendaSlots(slots);
      } catch (error) {
        if (!cancelled) setNotice("Não foi possível carregar os horários da agenda: " + (error?.message || "erro desconhecido"));
      } finally {
        if (!cancelled) setAgendaSettingsLoading(false);
      }
    }
    void loadAgendaSettings();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    setSelectedTemplateId("");
    if (!user?.id || !supabase) { setInstrumentTemplates([]); return; }
    let cancelled = false;
    setTemplatesLoading(true);
    async function loadTemplates() {
      const { data, error } = await supabase.from("psico_instrument_templates").select("*").order("created_at");
      if (cancelled) return;
      setTemplatesLoading(false);
      if (error) { setNotice(error.message); return; }
      for (const template of data || []) autosave.register("instrument_template:" + template.id, templatePayload(template));
      setInstrumentTemplates(data || []);
    }
    void loadTemplates();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    const patient = patients.find(p => p.id === selectedId);
    if (!patient) { setForm(null); return; }
    const next = { ...patient, anamnese: { ...EMPTY_ANAMNESE, ...(patient.anamnese || {}) } };
    setForm(next);
    autosave.register("patient:" + patient.id, patientPayload(next));
    // Patient editing is not reset by sidebar reorder or background saves.
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !user) return;
    const visitedAt = new Date().toISOString();
    setPatients(prev => prev.map(p => p.id === selectedId ? { ...p, last_visited_at: visitedAt } : p));
    void supabase.from("psico_patients").update({ last_visited_at: visitedAt }).eq("id", selectedId);
  }, [selectedId, user?.id]);

  useEffect(() => {
    if (!selectedId || !supabase || !user) {
      setSessions([]);
      setInstruments([]);
      return;
    }
    let cancelled = false;
    async function load() {
      const [s, i] = await Promise.all([
        supabase.from("psico_sessions").select("*").eq("patient_id", selectedId).order("created_at", { ascending: false }),
        supabase.from("psico_instruments").select("*, form:psico_instrument_forms(*)").eq("patient_id", selectedId).order("created_at", { ascending: true })
      ]);
      if (cancelled) return;
      if (s.error || i.error) setNotice(s.error?.message || i.error?.message);
      else {
        for (const session of s.data || []) autosave.register("session:" + session.id, sessionPayload(session));
        for (const instrument of i.data || []) autosave.register("instrument:" + instrument.id, instrumentPayload(instrument));
        setSessions(s.data || []);
        setExpandedSessions((s.data || []).length ? { [s.data[0].id]: true } : {});
        setInstruments(i.data || []);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedId, user?.id]);

  const hasOpenInstrumentForms = instruments.some(i => instrumentForm(i) && !i.received_at);
  useEffect(() => {
    if (!user?.id || !selectedId) return;
    let cancelled = false;
    async function refreshDelivery() {
      if (document.visibilityState === "hidden" || autosave.isPending() || deliveryActionInFlight.current) return;
      const revision = deliveryRevision.current;
      const { data, error } = await supabase.from("psico_instruments")
        .select("*, form:psico_instrument_forms(*)").eq("patient_id", selectedId).order("created_at", { ascending: true });
      if (cancelled || error || autosave.isPending() || deliveryActionInFlight.current || revision !== deliveryRevision.current) return;
      setInstruments(prev => prev.map(instrument => {
        const fresh = (data || []).find(row => row.id === instrument.id);
        return fresh ? { ...instrument, sent_at: fresh.sent_at, received_at: fresh.received_at,
          sent_session_id: fresh.sent_session_id, received_session_id: fresh.received_session_id,
          form: fresh.form, status: fresh.received_at ? "Concluído" : instrument.status } : instrument;
      }));
    }
    window.addEventListener("focus", refreshDelivery);
    const timer = hasOpenInstrumentForms ? setInterval(() => void refreshDelivery(), 15000) : null;
    return () => { cancelled = true; window.removeEventListener("focus", refreshDelivery); if (timer) clearInterval(timer); };
  }, [selectedId, user?.id, hasOpenInstrumentForms]);

  useEffect(() => {
    if (tab !== "agenda" || !user?.id || !supabase) return;
    let cancelled = false;
    async function loadAgendaSessions() {
      setAgendaLoading(true);
      setAgendaError("");
      const rows = [];
      const pageSize = 500;
      try {
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await supabase.from("psico_sessions")
            .select("id, patient_id, occurred_on, title, attendance_status, created_at")
            .order("occurred_on", { ascending: false })
            .order("id", { ascending: false })
            .range(offset, offset + pageSize - 1);
          if (error) throw error;
          if (cancelled) return;
          rows.push(...(data || []));
          if (!data || data.length < pageSize) break;
        }
        if (!cancelled) setAgendaSessions(rows);
      } catch (error) {
        if (!cancelled) setAgendaError(error?.message || "Erro desconhecido.");
      } finally {
        if (!cancelled) setAgendaLoading(false);
      }
    }
    void loadAgendaSessions();
    return () => { cancelled = true; };
  }, [tab, user?.id]);

  async function openAgenda() {
    if (!await autosave.flushAll()) {
      setNotice("Não foi possível salvar as alterações pendentes antes de abrir a agenda.");
      return;
    }
    setTab("agenda");
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openTab(name) {
    void autosave.flushAll();
    setTab(name);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function selectPatient(id) {
    if (switchingPatient.current) return;
    switchingPatient.current = true;
    try {
      if (id !== selectedId && !await autosave.flushAll()) {
        setNotice("Há alterações não salvas. Verifique a conexão ou os campos.");
        return;
      }
      const [{ data: latestPatient, error: patientError }, { count, error }] = await Promise.all([
        supabase.from("psico_patients").select("*").eq("id", id).single(),
        supabase.from("psico_sessions").select("id", { count: "exact", head: true }).eq("patient_id", id)
      ]);
      if (patientError || !latestPatient) {
        setNotice("Não foi possível carregar o registro atualizado do paciente: " +
          (patientError?.message || "registro não encontrado"));
        return;
      }
      setPatients(prev => prev.map(patient => patient.id === id ? latestPatient : patient));
      if (error) setNotice("Não foi possível verificar as sessões: " + error.message);
      if (id !== selectedId) {
        setForm(null);
        setSessions([]);
        setInstruments([]);
        setExpandedSessions({});
        setSelectedId(id);
      }
      setSearch("");
      setTab((count ?? (id === selectedId ? sessions.length : 0)) > 1 ? "sessoes" : "anamnese");
      setMenuOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      switchingPatient.current = false;
    }
  }

  async function signIn(e) {
    e.preventDefault();
    setBusy(true); setNotice("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setNotice(error.message);
    setBusy(false);
  }

  async function requestPasswordReset() {
    if (!email.trim()) {
      setNotice("Informe seu e-mail para receber o link de definição de senha.");
      return;
    }
    setBusy(true);
    setNotice("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/"
    });
    setNotice(error ? error.message : "Enviamos um link para seu e-mail. Confira sua caixa de entrada.");
    setBusy(false);
  }

  async function finishPasswordSetup(e) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setNotice("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    setNotice("");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setNotice(error.message);
    } else {
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSetup(false);
      window.history.replaceState(null, "", window.location.pathname);
      setNotice("Senha definida com sucesso.");
    }
    setBusy(false);
  }

  async function signOut() {
    if (!await autosave.flushAll()) {
      setNotice("Não foi possível salvar as alterações. Não saia ainda.");
      return;
    }
    await supabase.auth.signOut();
    setPasswordSetup(false);
    setMenuOpen(false);
    setTab("anamnese");
  }

  async function createPatient(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (!await autosave.flushAll()) {
      setNotice("Verifique as alterações pendentes antes de trocar de paciente.");
      return;
    }
    setBusy(true); setNotice("");
    const { data, error } = await supabase.from("psico_patients").insert({ name, anamnese: { consulta_data: localISO() } }).select().single();
    if (error) setNotice(error.message);
    else {
      setPatients(prev => [data, ...prev]);
      setSelectedId(data.id);
      setCreating(false);
      setNewName("");
      setTab("anamnese");
      setNotice("Paciente criado.");
    }
    setBusy(false);
  }

  function setField(key, value) {
    const next = { ...form, [key]: value };
    setForm(next);
    autosave.track("patient:" + selectedId, patientPayload(next));
  }

  function setAnamnese(key, value) {
    const next = { ...form, anamnese: { ...form.anamnese, [key]: value } };
    setForm(next);
    autosave.track("patient:" + selectedId, patientPayload(next));
  }

  function setConsultationWeekday(weekday) {
    const date = nextConsultationDateForWeekday(weekday, localISO());
    const allowed = slotHoursForDate(agendaSlots, date).map(hourLabel);
    const currentTime = form.anamnese?.consulta_horario || "";
    const next = {
      ...form,
      anamnese: {
        ...form.anamnese,
        consulta_data: date,
        consulta_horario: allowed.includes(currentTime) ? currentTime : ""
      }
    };
    setForm(next);
    autosave.track("patient:" + selectedId, patientPayload(next));
  }

  async function deletePatient() {
    if (!form || !window.confirm("Excluir o paciente e todos os registros?")) return;
    if (!await autosave.flushAll()) {
      setNotice("Não foi possível concluir o salvamento antes de excluir.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("psico_patients").delete().eq("id", form.id);
    if (error) setNotice(error.message);
    else {
      const remaining = patients.filter(p => p.id !== form.id);
      autosave.forget("patient:" + form.id);
      sessions.forEach(s => autosave.forget("session:" + s.id));
      instruments.forEach(i => autosave.forget("instrument:" + i.id));
      setPatients(remaining);
      setSelectedId(remaining[0]?.id || null);
      setPatientPhotoUrls(prev => { const next = { ...prev }; delete next[form.id]; return next; });
      if (user?.id) {
        const { error: photoError } = await supabase.storage.from("psico-patient-photos")
          .remove([user.id + "/" + form.id + "/photo"]);
        setNotice(photoError ? "Paciente excluído, mas a foto não pôde ser removida: " + photoError.message : "Paciente excluído.");
      } else setNotice("Paciente excluído.");
    }
    setBusy(false);
  }

  async function addAnamneseTemplate() {
    if (!await autosave.flushAll()) {
      setNotice("Há alterações pendentes que ainda não foram salvas.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.from("psico_anamnese_templates")
      .insert({ name: "Nova anamnese", questions: [] }).select().single();
    if (error) setNotice(error.message);
    else {
      autosave.register("anamnese_template:" + data.id, anamneseTemplatePayload(data));
      setAnamneseTemplates(prev => [...prev, data]);
      setEditingTemplateId(data.id);
    }
    setBusy(false);
  }

  function editAnamneseTemplate(id, transform) {
    const next = anamneseTemplates.map(template => template.id === id ? transform(template) : template);
    setAnamneseTemplates(next);
    const changed = next.find(template => template.id === id);
    if (changed) autosave.track("anamnese_template:" + id, anamneseTemplatePayload(changed));
  }

  function addAnamneseQuestion(id) {
    editAnamneseTemplate(id, template => ({
      ...template,
      questions: [...(template.questions || []), {
        ...newChoiceQuestion("Nova pergunta")
      }]
    }));
  }

  function editAnamneseQuestion(id, questionId, patch) {
    editAnamneseTemplate(id, template => ({
      ...template,
      questions: (template.questions || []).map(question => question.id === questionId
        ? { ...question, ...patch } : question)
    }));
  }

  function removeAnamneseQuestion(id, questionId) {
    if (!window.confirm("Remover esta pergunta do modelo? As respostas já registradas serão preservadas.")) return;
    editAnamneseTemplate(id, template => ({
      ...template,
      questions: (template.questions || []).filter(question => question.id !== questionId)
    }));
  }

  async function archiveAnamneseTemplate(id) {
    if (!window.confirm("Arquivar este modelo? Ele continuará acessível nos pacientes que já o utilizam.")) return;
    if (!await autosave.flushAll()) {
      setNotice("Não foi possível salvar as alterações pendentes.");
      return;
    }
    const { error } = await supabase.from("psico_anamnese_templates")
      .update({ archived: true }).eq("id", id);
    if (error) { setNotice(error.message); return; }
    setAnamneseTemplates(prev => prev.map(t => t.id === id ? { ...t, archived: true } : t));
    setEditingTemplateId(prev => prev === id
      ? anamneseTemplates.find(t => !t.archived && t.id !== id)?.id || null : prev);
  }

  async function selectAnamneseTemplate(id) {
    if (!form) return;
    if (!id || form.anamnese?.template_snapshots?.[id]) {
      const next = selectPatientAnamnese(form, id, null);
      if (next) {
        setForm(next);
        autosave.track("patient:" + selectedId, patientPayload(next));
      }
      return;
    }
    setBusy(true);
    try {
      if (!await autosave.flushAll()) {
        setNotice("Salve as alterações pendentes antes de selecionar a anamnese.");
        return;
      }
      // Fetch the committed version, not a possibly unsaved settings editor draft.
      const { data: template, error } = await supabase.from("psico_anamnese_templates")
        .select("id, name, revision, questions").eq("id", id).single();
      if (error || !template) throw error || new Error("Modelo não encontrado.");
      const next = selectPatientAnamnese(form, id, template);
      if (!next) throw new Error("Não foi possível guardar a versão da anamnese.");
      setForm(next);
      autosave.track("patient:" + selectedId, patientPayload(next));
    } catch (error) {
      setNotice("Não foi possível selecionar a anamnese: " + (error?.message || "erro desconhecido"));
    } finally {
      setBusy(false);
    }
  }

  function setAnamneseTemplateAnswer(questionId, value) {
    const templateId = form?.anamnese_template_id;
    if (!templateId) return;
    const current = form.anamnese || {};
    const allAnswers = current.template_answers || {};
    const next = {
      ...form,
      anamnese: {
        ...current,
        template_answers: {
          ...allAnswers,
          [templateId]: { ...(allAnswers[templateId] || {}), [questionId]: value }
        }
      }
    };
    setForm(next);
    autosave.track("patient:" + selectedId, patientPayload(next));
  }

  async function addSessionField() {
    setBusy(true);
    const position = Math.max(0, ...sessionFields.map(field => field.position || 0)) + 1;
    const { data, error } = await supabase.from("psico_session_fields").insert({
      label: "Novo campo", field_type: "single", options: [...DEFAULT_CHOICES], position
    }).select().single();
    if (error) setNotice(error.message);
    else {
      autosave.register("session_field:" + data.id, sessionFieldPayload(data));
      setSessionFields(prev => [...prev, data]);
    }
    setBusy(false);
  }

  function changeSessionFieldDefinition(id, patch) {
    const next = sessionFields.map(field => field.id === id ? { ...field, ...patch } : field);
    setSessionFields(next);
    const changed = next.find(field => field.id === id);
    if (changed) autosave.track("session_field:" + id, sessionFieldPayload(changed));
  }

  async function archiveSessionField(id) {
    if (!window.confirm("Remover este campo das próximas sessões? As respostas antigas serão preservadas.")) return;
    if (!await autosave.flushAll()) {
      setNotice("Não foi possível salvar as alterações pendentes.");
      return;
    }
    const { error } = await supabase.from("psico_session_fields").update({ archived: true }).eq("id", id);
    if (error) setNotice(error.message);
    else setSessionFields(prev => prev.map(field => field.id === id ? { ...field, archived: true } : field));
  }

  async function addSession() {
    setBusy(true);
    const highestIndex = sessions.reduce((max, session) => {
      const match = /^Sessão\s+(\d+)\b/i.exec(session.title || "");
      return Math.max(max, match ? Number(match[1]) : 0);
    }, sessions.length);
    const { data, error } = await supabase.from("psico_sessions").insert({
      patient_id: selectedId,
      occurred_on: new Date().toLocaleDateString("en-CA"),
      duration_minutes: 60,
      title: "Sessão " + (highestIndex + 1),
      notes: ""
    }).select().single();
    if (error) setNotice(error.message);
    else {
      autosave.register("session:" + data.id, sessionPayload(data));
      setSessions(prev => [data, ...prev]);
      setExpandedSessions(prev => ({ ...prev, [data.id]: true }));
    }
    setBusy(false);
  }

  function changeSession(id, field, value) {
    const next = sessions.map(s => s.id === id ? { ...s, [field]: value } : s);
    setSessions(next);
    const changed = next.find(s => s.id === id);
    if (changed) autosave.track("session:" + id, sessionPayload(changed));
  }

  function changeSessionCustomField(session, fieldId, value) {
    changeSession(session.id, "custom_fields", { ...(session.custom_fields || {}), [fieldId]: value });
  }

  async function deleteSession(id) {
    if (instruments.some(i => i.session_id === id || i.sent_session_id === id || i.received_session_id === id || instrumentForm(i)?.source_session_id === id)) {
      setNotice("Esta sessão possui instrumentos vinculados ou registros de envio/recebimento e não pode ser excluída.");
      return;
    }
    if (!window.confirm("Excluir esta sessão?")) return;
    if (!await autosave.flushAll()) {
      setNotice("Não foi possível salvar as alterações pendentes.");
      return;
    }
    const { error } = await supabase.from("psico_sessions").delete().eq("id", id);
    if (error) setNotice(error.message);
    else {
      autosave.forget("session:" + id);
      setSessions(prev => prev.filter(s => s.id !== id));
      setExpandedSessions(prev => { const next = { ...prev }; delete next[id]; return next; });
    }
  }

  async function addInstrumentTemplate() {
    setBusy(true);
    const { data, error } = await supabase.from("psico_instrument_templates").insert({ name: "Novo instrumento" }).select().single();
    if (error) setNotice(error.message);
    else {
      autosave.register("instrument_template:" + data.id, templatePayload(data));
      setInstrumentTemplates(prev => [...prev, data]);
    }
    setBusy(false);
  }

  function changeTemplate(id, patch) {
    const next = instrumentTemplates.map(t => t.id === id ? { ...t, ...patch } : t);
    setInstrumentTemplates(next);
    autosave.track("instrument_template:" + id, templatePayload(next.find(t => t.id === id)));
  }

  async function archiveTemplate(id) {
    if (!window.confirm("Remover este modelo? Os instrumentos já aplicados serão preservados.")) return;
    if (!await autosave.flushAll()) return;
    const { error } = await supabase.from("psico_instrument_templates").update({ archived: true }).eq("id", id);
    if (error) setNotice(error.message);
    else {
      setInstrumentTemplates(prev => prev.map(t => t.id === id ? { ...t, archived: true } : t));
      if (selectedTemplateId === id) setSelectedTemplateId("");
    }
  }

  async function addInstrument() {
    const template = instrumentTemplates.find(t => t.id === selectedTemplateId && !t.archived);
    if (!template || !sessions.length || busy) return;
    setBusy(true);
    if (!await autosave.flushAll()) { setBusy(false); return; }
    const { data, error } = await supabase.from("psico_instruments").insert({
      patient_id: selectedId, template_id: template.id, name: template.name, category: template.category,
      status: "Pendente", notes: "", tables: instantiateTables(template.tables || []), form_questions: template.form_questions ?? null
    }).select().single();
    if (error) setNotice(error.message);
    else {
      autosave.register("instrument:" + data.id, instrumentPayload(data));
      setInstruments(prev => [...prev, data]);
    }
    setBusy(false);
  }

  function updateInstrument(id, update) {
    const next = instruments.map(i => i.id === id ? update(i) : i);
    setInstruments(next);
    const changed = next.find(i => i.id === id);
    if (changed) autosave.track("instrument:" + id, instrumentPayload(changed));
  }

  function changeInstrument(id, field, value) {
    updateInstrument(id, i => ({ ...i, [field]: value }));
  }

  async function instrumentAction(id, action, sessionId = null) {
    if (busy || deliveryActionInFlight.current) return;
    deliveryActionInFlight.current = true;
    deliveryRevision.current += 1;
    setBusy(true);
    try {
      if (!await autosave.flushAll()) { setNotice("Não foi possível salvar as alterações pendentes."); return; }
      const { data, error } = await supabase.rpc("psico_instrument_action", { p_id: id, p_action: action, p_session_id: sessionId });
      if (error) throw error;
      const next = { ...data.instrument, form: data.form };
      autosave.register("instrument:" + id, instrumentPayload(next));
      setInstruments(prev => prev.map(i => i.id === id ? next : i));
    } catch (err) { setNotice(err?.message || "Não foi possível atualizar o instrumento."); }
    finally { deliveryActionInFlight.current = false; setBusy(false); }
  }

  async function deleteInstrument(id) {
    if (!window.confirm("Excluir este instrumento?")) return;
    if (!await autosave.flushAll()) {
      setNotice("Não foi possível salvar as alterações pendentes.");
      return;
    }
    const { error } = await supabase.from("psico_instruments").delete().eq("id", id);
    if (error) setNotice(error.message);
    else {
      autosave.forget("instrument:" + id);
      setInstruments(prev => prev.filter(i => i.id !== id));
    }
  }

  // Reflect saved patient edits in the sidebar without resetting the active draft.
  useEffect(() => {
    if (!form || form.id !== selectedId || autosave.status !== "saved") return;
    const stored = patientPayload(form);
    setPatients(prev => {
      const patient = prev.find(p => p.id === selectedId);
      if (!patient || JSON.stringify(patientPayload(patient)) === JSON.stringify(stored)) return prev;
      return prev.map(p => p.id === selectedId ? { ...p, ...stored } : p);
    });
  }, [autosave.status, form, selectedId]);

  // Draft names in the "new patient" dialog haven't been inserted yet.
  useEffect(() => {
    if (!creating || !newName.trim()) return;
    const warnOnUnload = event => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnOnUnload);
    return () => window.removeEventListener("beforeunload", warnOnUnload);
  }, [creating, newName]);

  if (!configured) return (
    <div className="center-screen">
      <div className="auth-card">
        <div className="logo-icon">PSI</div>
        <h1>Painel Psico</h1>
        <p>Conexão com o Supabase pendente.</p>
        <small>Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no Vercel.</small>
      </div>
    </div>
  );

  if (authLoading) return <div className="center-screen"><div className="muted">Carregando...</div></div>;

  if (user && passwordSetup) return (
    <div className="center-screen">
      <form className="auth-card" onSubmit={finishPasswordSetup}>
        <div className="logo-icon">PSI</div>
        <h1>Definir senha</h1>
        <p>Crie uma senha para acessar o Painel Psico.</p>
        <InputField label="Nova senha" type="password" value={newPassword} onChange={setNewPassword} />
        <InputField label="Confirmar senha" type="password" value={confirmPassword} onChange={setConfirmPassword} />
        <button className="btn primary full-btn" disabled={busy}>{busy ? "Salvando..." : "Salvar senha"}</button>
        {notice && <p className="error" role="status">{notice}</p>}
      </form>
    </div>
  );

  if (!user) return (
    <div className="center-screen">
      <form className="auth-card" onSubmit={signIn}>
        <div className="logo-icon">PSI</div>
        <h1>Painel Psico</h1>
        <p>Acessar prontuários</p>
        <InputField label="E-mail" type="email" value={email} onChange={setEmail} />
        <InputField label="Senha" type="password" value={password} onChange={setPassword} />
        <button className="btn primary full-btn" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button>
        <button type="button" className="text-btn" disabled={busy} onClick={requestPasswordReset}>Definir ou recuperar senha</button>
        {notice && <p className="error" role="status">{notice}</p>}
      </form>
    </div>
  );

  const listed = search.trim()
    ? patients.filter(p => p.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")))
    : [...patients]
        .sort((a, b) => Date.parse(b.last_visited_at || b.created_at) -
                        Date.parse(a.last_visited_at || a.created_at))
        .slice(0, 3);
  const saveLabel = autosave.status === "saving" ? "Salvando…"
    : autosave.status === "pending" ? "Pendente"
    : autosave.status === "error" ? "Não salvo" : "Salvo";
  const anamnese = form?.anamnese || EMPTY_ANAMNESE;
  const consultationHours = slotHoursForDate(agendaSlots, anamnese.consulta_data || "");
  const consultationTime = anamnese.consulta_horario || "";
  const consultationTimeConfigured = consultationHours.some(hour => hourLabel(hour) === consultationTime);
  const selectedAnamneseTemplate = anamneseTemplates.find(t => t.id === form?.anamnese_template_id);
  const selectedAnamneseSnapshot = patientAnamneseSnapshot(anamnese, form?.anamnese_template_id, selectedAnamneseTemplate);
  const historicalAnamneses = Object.entries(anamnese.template_snapshots || {})
    .filter(([id]) => id !== form?.anamnese_template_id &&
      Object.keys(anamnese.template_answers?.[id] || {}).length > 0)
    .map(([id, snapshot]) => ({
      id, snapshot: patientAnamneseSnapshot(anamnese, id, snapshot),
      answers: anamnese.template_answers?.[id] || {}
    }));
  const editingAnamneseTemplate = anamneseTemplates.find(t => t.id === editingTemplateId && !t.archived);
  const selectedAnswers = anamnese.template_answers?.[form?.anamnese_template_id] || {};
  const complete = instruments.filter(i => i.status === "Concluído").length;
  const consultationWeekday = weekdayFromConsultationDate(anamnese.consulta_data || "");
  const sessionSchedule = consultationWeekday === "" ? "—"
    : `${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][Number(consultationWeekday)]} · ${consultationTime || "—"}`;

  return (
    <div className="app">
      {menuOpen && <button className="backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
      <aside className={menuOpen ? "side-menu show" : "side-menu"}>
        <div className="brand"><div className="brandmark">PSI</div><strong>Painel Psico</strong></div>
        <button type="button" className={"agenda-side-link" + (tab === "agenda" ? " active" : "")}
          aria-current={tab === "agenda" ? "page" : undefined} onClick={() => void openAgenda()}>
          <SidebarIcon name="calendar-days" />Agenda
        </button>
        <div className="side-section">
          <div className="side-label">Pacientes</div>
          <input className="patient-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar paciente" />
          <div className="patient-links" aria-label={search.trim() ? "Resultados da busca" : "Pacientes recentes"}>
            {listed.map(p => <button key={p.id} className={selectedId === p.id && tab !== "agenda" ? "patient-link active" : "patient-link"} onClick={() => void selectPatient(p.id)}>
              <span className="patient-sidebar-avatar" aria-hidden="true">
                {patientPhotoUrls[p.id] ? <img src={patientPhotoUrls[p.id]} alt="" /> : p.name.trim().slice(0, 1).toUpperCase()}
              </span><span className="patient-sidebar-name">{p.name}</span>
            </button>)}
            {!listed.length && <span className="side-empty">{search.trim() ? "Nenhum resultado" : "Nenhum paciente"}</span>}
          </div>
          <button className="side-add" onClick={() => { setCreating(true); setMenuOpen(false); }}>+ Novo paciente</button>
        </div>
        {form && <nav className="side-nav" aria-label="Seções">
          {[
            ["anamnese", "Anamnese", "user-round"],
            ["sessoes", "Sessões", "message-circle"],
            ["instrumentos", "Instrumentos", "brain"],
            ["laudo", "Laudo", "file-text"]
          ].map(([key, label, icon]) => <button key={key} className={tab === key ? "active" : ""}
            onClick={() => openTab(key)}><SidebarIcon name={icon} />{label}</button>)}
        </nav>}
        <div className="sidebar-footer">
          <button type="button" className={"settings-link" + (tab === "configuracoes" ? " active" : "")}
            aria-current={tab === "configuracoes" ? "page" : undefined}
            onClick={() => openTab("configuracoes")}><SidebarIcon name="settings" />Configurações</button>
          <button className="signout" onClick={signOut}><SidebarIcon name="log-out" />Sair</button>
        </div>
      </aside>

      <main onBlurCapture={() => { if (autosave.isPending()) void autosave.flushAll(); }}>
        <header className="topbar">
          <button className="menu-btn" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}>☰</button>
          <strong>{tab === "configuracoes" ? "Configurações" : tab === "agenda" ? "Agenda" : form?.name || "Painel Psico"}</strong>
          {tab !== "configuracoes" && tab !== "agenda" && <span className={"save-state save-" + autosave.status} aria-live="polite">{saveLabel}</span>}
        </header>

        <div className="content">
          {autosave.error && <div className="notification save-error" role="alert">{autosave.error}</div>}
          {notice && <div className="notification" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Fechar">×</button></div>}

          {creating && <div className="modal-shade" onClick={() => setCreating(false)}>
            <form className="modal" onSubmit={createPatient} onClick={e => e.stopPropagation()}>
              <h2>Novo paciente</h2>
              <InputField label="Nome" value={newName} onChange={setNewName} />
              <div className="actions"><button type="button" className="btn" onClick={() => setCreating(false)}>Cancelar</button><button disabled={busy || !newName.trim()} className="btn primary">Criar</button></div>
            </form>
          </div>}

          {tab === "agenda" ? <AgendaPanel patients={patients} sessions={agendaSessions}
            schedule={agendaSlots} patientPhotoUrls={patientPhotoUrls} loading={agendaLoading || agendaSettingsLoading} error={agendaError}
            onOpenPatient={id => void selectPatient(id)} />
          : tab === "configuracoes" ? <div className="settings-page">
            <div className="hero"><h1>Configurações</h1></div>
            <div className="content-stack">
              <AgendaSettings slots={agendaSlots} loading={agendaSettingsLoading}
                onChange={slots => {
                  setAgendaSlots(slots);
                  autosave.track("agenda_settings:" + user.id, {slots});
                }} />
              <section className="card">
                <div className="cardhead">
                  <h2>Configurar Anamneses</h2>
                  <button className="btn soft" disabled={busy || anamneseTemplatesLoading}
                    onClick={() => void addAnamneseTemplate()}>+ Novo modelo</button>
                </div>
                <div className="cardbody">
                  <p className="muted">Crie um modelo com perguntas personalizadas. Cada paciente pode utilizar um modelo diferente. Alterações salvas automaticamente.</p>
                  {anamneseTemplatesLoading ? <p className="muted">Carregando modelos…</p>
                    : <div className="anamnese-template-layout">
                      {anamneseTemplates.filter(template => !template.archived).length > 1 && (
                        <label className="field anamnese-template-picker"><span>Selecionar modelo</span>
                          <select value={editingTemplateId || ""} onChange={event => setEditingTemplateId(event.target.value)}>
                            {anamneseTemplates.filter(template => !template.archived).map(template => (
                              <option key={template.id} value={template.id}>{template.name || "Modelo sem nome"}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      {!anamneseTemplates.some(template => !template.archived) &&
                        <span className="muted">Nenhum modelo criado.</span>}
                      {editingAnamneseTemplate && <div className="anamnese-template-editor" key={editingAnamneseTemplate.id}>
                        <div className="anamnese-template-heading">
                          <InputField label="Nome do modelo" value={editingAnamneseTemplate.name}
                            onChange={value => editAnamneseTemplate(editingAnamneseTemplate.id, template =>
                              ({ ...template, name: value }))} />
                          <button className="text-btn" type="button"
                            onClick={() => void archiveAnamneseTemplate(editingAnamneseTemplate.id)}>Arquivar modelo</button>
                        </div>
                        {(editingAnamneseTemplate.questions || []).map((question, index) => (
                          <div key={question.id} className="session-field-editor anamnese-question-editor">
                            {question.section && (index === 0 ||
                              editingAnamneseTemplate.questions[index - 1]?.section !== question.section) &&
                              <h3 className="anamnese-section-title">{question.section}</h3>}
                            <div className="session-field-config-row">
                              <InputField label={"Pergunta " + (index + 1)} value={question.label}
                                onChange={value => editAnamneseQuestion(editingAnamneseTemplate.id, question.id,
                                  { label: value })} />
                              <label className="field"><span>Tipo de resposta</span>
                                <select value={question.field_type}
                                  onChange={event => editAnamneseQuestion(editingAnamneseTemplate.id, question.id,
                                    typeChange(question, event.target.value))}>
                                  <option value="text">Texto curto</option>
                                  <option value="textarea">Texto longo</option>
                                  <option value="single">Escolha única</option>
                                  <option value="multiple">Múltipla escolha</option>
                                </select>
                              </label>
                            </div>
                            {(question.field_type === "single" || question.field_type === "multiple") &&
                              <ChoiceOptionsEditor label={question.label || "Pergunta " + (index + 1)}
                                options={question.options || []} multiple={question.field_type === "multiple"}
                                onChange={options => editAnamneseQuestion(editingAnamneseTemplate.id, question.id, { options })} />}
                            <button type="button" className="text-btn"
                              onClick={() => removeAnamneseQuestion(editingAnamneseTemplate.id, question.id)}>
                              Remover pergunta
                            </button>
                          </div>
                        ))}
                        <button type="button" className="btn soft"
                          onClick={() => addAnamneseQuestion(editingAnamneseTemplate.id)}>+ Adicionar pergunta</button>
                      </div>}
                    </div>}
                </div>
              </section>
              <section className="card">
                <div className="cardhead">
                  <h2>Configurar Sessões</h2>
                  <button className="btn soft" disabled={busy || sessionFieldsLoading} onClick={addSessionField}>+ Adicionar campo</button>
                </div>
                <div className="cardbody session-field-config">
                  <p className="muted">Os campos aparecem antes de Observações em todas as sessões. As alterações são salvas automaticamente.</p>
                  {sessionFieldsLoading && <p className="muted">Carregando campos…</p>}
                  {!sessionFieldsLoading && !sessionFields.some(field => !field.archived) &&
                    <p className="muted">Nenhum campo personalizado configurado.</p>}
                  {sessionFields.filter(field => !field.archived).map(field => (
                    <div className="session-field-editor" key={field.id}>
                      <div className="session-field-config-row">
                        <InputField label="Nome do campo" value={field.label}
                          onChange={value => changeSessionFieldDefinition(field.id, { label: value })} />
                        <label className="field"><span>Tipo de resposta</span>
                          <select value={field.field_type}
                            onChange={event => changeSessionFieldDefinition(field.id, typeChange(field, event.target.value))}>
                            <option value="text">Texto curto</option>
                            <option value="textarea">Texto longo</option>
                            <option value="single">Escolha única</option>
                            <option value="multiple">Múltipla escolha</option>
                          </select>
                        </label>
                      </div>
                      {(field.field_type === "single" || field.field_type === "multiple") &&
                        <ChoiceOptionsEditor label={field.label || "Novo campo"}
                          options={field.options || []} multiple={field.field_type === "multiple"}
                          onChange={options => changeSessionFieldDefinition(field.id, { options })} />}
                      <div className="card-actions">
                        <button className="text-btn" onClick={() => void archiveSessionField(field.id)}>Remover campo</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="card">
                <div className="cardhead"><h2>Configurar Instrumentos</h2><button className="btn soft" disabled={busy || templatesLoading} onClick={addInstrumentTemplate}>+ Criar instrumento</button></div>
                <div className="cardbody instrument-list">
                  {templatesLoading && <p className="muted">Carregando instrumentos…</p>}
                  {!templatesLoading && !instrumentTemplates.some(t => !t.archived) && <p className="muted">Crie os instrumentos que poderão ser adicionados aos pacientes.</p>}
                  {instrumentTemplates.filter(t => !t.archived).map(t => <div className="instrument-entry" key={t.id}>
                    <InputField label="Nome do instrumento" value={t.name} onChange={name => changeTemplate(t.id, { name })} />
                    <InputField label="Área avaliada" value={t.category} onChange={category => changeTemplate(t.id, { category })} />
                    {(t.tables || []).map(table => <TableEditor key={table.id} table={table}
                      onChange={next => changeTemplate(t.id, { tables: t.tables.map(item => item.id === table.id ? next : item) })}
                      onRemove={() => { if (window.confirm("Remover esta tabela do modelo?")) changeTemplate(t.id, { tables: t.tables.filter(item => item.id !== table.id) }); }} />)}
                    <button className="btn soft" onClick={() => changeTemplate(t.id, { tables: [...(t.tables || []), createTable()] })}>+ Adicionar tabela</button>
                    <InstrumentFormEditor questions={t.form_questions ?? null} onChange={form_questions => changeTemplate(t.id, { form_questions })} />
                    <button className="text-btn" onClick={() => void archiveTemplate(t.id)}>Remover instrumento</button>
                  </div>)}
                </div>
              </section>
              <ReportSettings settings={reportSettings} status={saveLabel} onChange={settings => {
                setReportSettings(settings);
                autosave.track("report_settings:" + user.id, {settings});
              }} />
            </div>
          </div> : !form ? <div className="empty-state">
            <h1>Pacientes</h1>
            <p>Selecione um paciente ou crie um novo registro.</p>
            <button className="btn primary" onClick={() => setCreating(true)}>+ Novo paciente</button>
          </div> : <>
            <div className="hero">
              <div className="patient-heading">
                <button type="button" className="patient-photo-button"
                  disabled={photoUploading} onClick={() => photoInputRef.current?.click()}
                  aria-label={photoUploading ? "Enviando foto" : "Adicionar ou alterar foto do paciente"}
                  title="Adicionar ou alterar foto do paciente">
                  {patientPhotoUrls[selectedId]
                    ? <img src={patientPhotoUrls[selectedId]} alt="" />
                    : <span aria-hidden="true">{form.name?.trim().slice(0, 1).toUpperCase() || "?"}</span>}
                  <span className="patient-photo-edit" aria-hidden="true">✎</span>
                </button>
                <div className="patient-heading-text">
                  <h1>{form.name}</h1>
                  {patientPhotoUrls[selectedId] && <button type="button" className="text-btn patient-photo-remove"
                    disabled={photoUploading} onClick={() => void removePatientPhoto()}>Remover foto</button>}
                </div>
                <input ref={photoInputRef} className="patient-photo-input" type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Selecionar foto do paciente" onChange={uploadPatientPhoto} />
              </div>
              <span className={"save-state save-" + autosave.status} aria-live="polite">{saveLabel}</span>
            </div>

            <div className="summary">
              <div className="stat"><span>Idade</span><b>{formatAge(form.birth_date) || "—"}</b></div>
              <div className="stat"><span>Sessões</span><b>{sessions.length}</b></div>
              <div className="stat"><span>Instrumentos</span><b>{complete}/{instruments.length}</b></div>
              <div className="stat"><span>Sessão</span><b>{sessionSchedule}</b></div>
            </div>

            <div className="mobile-tabs">
              {[
                ["anamnese", "Anamnese"], ["sessoes", "Sessões"],
                ["instrumentos", "Instrumentos"], ["laudo", "Laudo"]
              ].map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => openTab(key)}>{label}</button>)}
            </div>

            {tab === "anamnese" && <div className="content-stack">
              <section className="card">
                <div className="cardhead"><h2>Identificação</h2></div>
                <div className="cardbody fields">
                  <InputField label="Nome" value={form.name} onChange={v => setField("name", v)} />
                  <InputField label="Data de nascimento" type="date" value={form.birth_date} onChange={v => setField("birth_date", v)} />
                  <div className="consultation-datetime">
                    <label className="field"><span>Dia da consulta</span>
                      <select aria-label="Dia da consulta" value={weekdayFromConsultationDate(anamnese.consulta_data || "")}
                        onChange={e => setConsultationWeekday(e.target.value)}>
                        <option value="">Selecione o dia da semana</option>
                        {AGENDA_WEEKDAYS.map(([day, label]) =>
                          <option key={day} value={String(day)}>{label}</option>)}
                      </select>
                    </label>
                    <label className="field"><span>Horário da consulta</span>
                      <select aria-label="Horário da consulta" value={consultationTime}
                        disabled={agendaSettingsLoading || !anamnese.consulta_data || !consultationHours.length}
                        onChange={e => setAnamnese("consulta_horario", e.target.value)}>
                        <option value="">{agendaSettingsLoading ? "Carregando horários…"
                          : !anamnese.consulta_data ? "Selecione o dia"
                          : consultationHours.length ? "Selecione o horário" : "Sem horários disponíveis"}</option>
                        {consultationTime && !consultationTimeConfigured &&
                          <option value={consultationTime}>{consultationTime} (fora da agenda)</option>}
                        {consultationHours.map(hour => <option key={hour} value={hourLabel(hour)}>{hourLabel(hour)}</option>)}
                      </select>
                    </label>
                  </div>
                  <InputField label="Escolaridade" value={form.grade} onChange={v => setField("grade", v)} />
                  <InputField label="Escola" value={form.school} onChange={v => setField("school", v)} />
                  <InputField label="Responsável entrevistado" value={form.guardian} onChange={v => setField("guardian", v)} />
                  <InputField label="Solicitante" value={form.requester} onChange={v => setField("requester", v)} />
                </div>
              </section>
              <section className="card">
                <div className="cardhead"><h2>Anamnese</h2></div>
                <div className="cardbody">
                  <label className="field anamnese-type-field"><span>Tipo de anamnese</span>
                    <select value={form.anamnese_template_id || ""} disabled={busy}
                      onChange={event => void selectAnamneseTemplate(event.target.value)}>
                      <option value="">Selecionar modelo</option>
                      {anamneseTemplates.filter(template => !template.archived ||
                        template.id === form.anamnese_template_id).map(template => (
                        <option key={template.id} value={template.id}>
                          {template.name || "Modelo sem nome"}{template.archived ? " (arquivado)" : ""}
                        </option>
                      ))}
                      {form.anamnese_template_id && !selectedAnamneseTemplate && selectedAnamneseSnapshot &&
                        <option value={form.anamnese_template_id}>{selectedAnamneseSnapshot.name} (histórico)</option>}
                    </select>
                  </label>
                  {form.anamnese_template_id && selectedAnamneseSnapshot ? (
                    <div className="session-custom-fields anamnese-answers">
                      <p className="anamnese-version-note">
                        {selectedAnamneseSnapshot.name} · Versão {selectedAnamneseSnapshot.revision} preservada para este paciente
                      </p>
                      {(selectedAnamneseSnapshot.questions || []).map((question, index) =>
                        <div className="anamnese-question-block" key={question.id}>
                          {question.section && (index === 0 ||
                            selectedAnamneseSnapshot.questions[index - 1]?.section !== question.section) &&
                            <h3 className="anamnese-section-title">{question.section}</h3>}
                          <QuestionAnswerInput field={question}
                            namePrefix={"anamnese-" + form.id + "-" + selectedAnamneseSnapshot.template_id}
                            value={selectedAnswers[question.id]}
                            disabled={Boolean(question.historical_unknown)}
                            onChange={value => setAnamneseTemplateAnswer(question.id, value)} />
                        </div>)}
                      {!selectedAnamneseSnapshot.questions?.length &&
                        <p className="muted">Este modelo ainda não tem perguntas. Configure-o em Configurações.</p>}
                    </div>                  ) : form.anamnese_template_id ? (
                    <p className="muted">Modelo não encontrado. As respostas existentes foram preservadas.</p>
                  ) : hasLegacyAnamnese(anamnese) ? (
                    <div className="legacy-anamnese">
                      <p className="muted">Respostas anteriores (sem modelo). Escolha um modelo acima quando desejar.</p>
                      {AREAS.map(([key, label]) => <label className="question" key={key}>
                        <span>{label}</span>
                        <textarea value={anamnese[key] || ""} onChange={e => setAnamnese(key, e.target.value)} />
                      </label>)}
                    </div>
                  ) : (
                    <p className="muted">Selecione o modelo de anamnese deste paciente. Crie modelos em Configurações → Configurar Anamneses.</p>
                  )}
                  {historicalAnamneses.length > 0 && <div className="anamnese-history-list">
                    <h3>Anamneses anteriores</h3>
                    {historicalAnamneses.map(({ id, snapshot, answers }) => snapshot &&
                      <details className="anamnese-history" key={id}>
                        <summary>{snapshot.name} · Versão {snapshot.revision} · respostas preservadas</summary>
                        <div className="session-custom-fields">
                          {(snapshot.questions || []).filter(question =>
                            Object.prototype.hasOwnProperty.call(answers, question.id)).map((question, index) =>
                            <div className="anamnese-question-block" key={question.id}>
                              <QuestionAnswerInput field={question} value={answers[question.id]}
                                disabled namePrefix={"historico-" + form.id + "-" + id} onChange={() => {}} />
                            </div>)}
                        </div>
                      </details>)}
                  </div>}
                  <div className="card-actions">
                    <button className="btn danger" disabled={busy} onClick={deletePatient}>Excluir paciente</button>
                  </div>
                </div>
              </section>
            </div>}

            {tab === "sessoes" && <section className="card">
              <div className="cardhead"><h2>Sessões</h2><button className="btn soft" disabled={busy} onClick={addSession}>+ Nova sessão</button></div>
              <div className="cardbody">
                {!sessions.length && <p className="muted">Nenhuma sessão registrada.</p>}
                {sessions.map(s => <div className="session-entry" key={s.id}>
                  <button type="button" className={"session-summary" + (expandedSessions[s.id] ? " is-open" : "")}
                    aria-expanded={!!expandedSessions[s.id]} aria-controls={"session-details-" + s.id}
                    onClick={() => setExpandedSessions(prev => ({ ...prev, [s.id]: !prev[s.id] }))}>
                    <span className="session-summary-main">
                      <strong>{s.title || "Sessão"}</strong>
                      <span className="session-summary-meta">{formatDate(s.occurred_on)} · {s.duration_minutes} min</span>
                    </span>
                    <span className="session-summary-toggle" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                  </button>
                  {instruments.some(i => i.sent_session_id === s.id || i.received_session_id === s.id) && <div className="session-instrument-labels">
                    {instruments.filter(i => i.sent_session_id === s.id).map(i => <span className="instrument-badge" key={i.id + "-sent"}>{i.name} Enviado</span>)}
                    {instruments.filter(i => i.received_session_id === s.id).map(i => <span className="instrument-badge received" key={i.id + "-received"}>{i.name} Recebido</span>)}
                  </div>}
                  {instruments.filter(i => waitingInSession(i, s, sessions)).map(i => <div className="instrument-waiting" key={i.id}>
                    <span className="instrument-wait-message"><SidebarIcon name="triangle-alert" className="instrument-wait-icon" /><span>Aguardando conclusão de <strong>{i.name}</strong> · enviado em {deliveryDate(i.sent_at)}</span></span>
                    <button className="btn" disabled={busy} onClick={() => void instrumentAction(i.id, "receive", s.id)}>Marcar como recebido</button>
                  </div>)}
                  {expandedSessions[s.id] && <div id={"session-details-" + s.id} className="session-details">
                    <div className="session-fields">
                      <InputField label="Título" value={s.title} onChange={v => changeSession(s.id, "title", v)} />
                      <InputField label="Data" type="date" value={s.occurred_on} onChange={v => changeSession(s.id, "occurred_on", v)} />
                      <InputField label="Duração (min)" type="number" value={String(s.duration_minutes)} onChange={v => changeSession(s.id, "duration_minutes", v)} />
                    </div>
                    <SessionCustomFields
                      sessionId={s.id} fields={sessionFields.filter(field => !field.archived ||
                        Object.prototype.hasOwnProperty.call(s.custom_fields || {}, field.id))}
                      values={s.custom_fields || {}}
                      onChange={(fieldId, value) => changeSessionCustomField(s, fieldId, value)} />
                    <label className="question"><span>Observações</span>
                      <textarea value={s.notes || ""} onChange={e => changeSession(s.id, "notes", e.target.value)} />
                    </label>
                    <div className="card-actions"><button className="btn danger" onClick={() => void deleteSession(s.id)}>Excluir</button></div>
                  </div>}
                </div>)}
              </div>
            </section>}

            {tab === "instrumentos" && <section className="card">
              <div className="cardhead"><h2>Instrumentos</h2></div>
              <div className="cardbody instrument-list">
                <div className="instrument-add">
                  <label className="field"><span>Instrumento configurado</span><select aria-label="Instrumento configurado" value={selectedTemplateId} disabled={templatesLoading || busy} onChange={e => setSelectedTemplateId(e.target.value)}>
                    <option value="">Selecione um instrumento</option>
                    {instrumentTemplates.filter(t => !t.archived).map(t => <option key={t.id} value={t.id}>{t.name || "Instrumento sem nome"}</option>)}
                  </select></label>
                  <button className="btn soft" disabled={busy || templatesLoading || !selectedTemplateId || !sessions.length} onClick={addInstrument}>+ Adicionar</button>
                </div>
                {!templatesLoading && !instrumentTemplates.some(t => !t.archived) && <p className="muted">Cadastre instrumentos em <button className="text-btn" onClick={() => openTab("configuracoes")}>Configurações → Configurar Instrumentos</button>.</p>}
                {!sessions.length && <p className="muted">Crie uma sessão antes de adicionar um instrumento.</p>}
                {!instruments.length && <p className="muted">Nenhum instrumento registrado.</p>}
                {instruments.map(i => <div className="instrument-entry" key={i.id}>
                  <fieldset className="instrument-fields" disabled={busy}>
                  <div className="instrument-head">
                    <div><h3>{i.name}</h3>{i.category && <p className="muted">{i.category}</p>}</div>
                    {i.received_at ? <div className="field"><span>Status</span><b>Concluído</b></div> : <AnimatedSelect label="Status" value={i.status} options={["Pendente", "Em andamento", "Concluído"]} onChange={v => changeInstrument(i.id, "status", v)} />}
                  </div>
                  <label className="field"><span>Sessão</span><select aria-label="Sessão" value={i.session_id || ""} onChange={e => changeInstrument(i.id, "session_id", e.target.value)}>
                    <option value="" disabled>Selecione uma sessão</option>
                    {sessions.map(s => <option key={s.id} value={s.id}>{s.title || "Sessão"} — {formatDate(s.occurred_on)}</option>)}
                  </select></label>
                  {(i.tables || []).map(table => <InstrumentTable key={table.id} table={table}
                    onChange={next => changeInstrument(i.id, "tables", i.tables.map(item => item.id === table.id ? next : item))} />)}
                  <label className="question"><span>Observações</span><textarea aria-label="Observações" value={i.notes || ""} onChange={e => changeInstrument(i.id, "notes", e.target.value)} /></label>
                  <InstrumentDelivery instrument={i} sessions={sessions} busy={busy} onAction={instrumentAction}
                    hasForm={Boolean((i.form_questions ?? instrumentTemplates.find(t => t.id === i.template_id)?.form_questions)?.length)} />
                  <div className="card-actions"><button className="btn danger" onClick={() => void deleteInstrument(i.id)}>Excluir</button></div>
                  </fieldset>
                </div>)}
              </div>
            </section>}

            {tab === "laudo" && <ReportPanel key={selectedId} patientId={selectedId}
              beforeGenerate={() => autosave.flushAll()} conclusion={form.conclusion}
              onConclusionChange={value => setField("conclusion", value)} />}

          </>}
        </div>
      </main>
    </div>
  );
}
