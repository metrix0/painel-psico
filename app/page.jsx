"use client";

import { useEffect, useRef, useState } from "react";
import { configured, supabase } from "../lib/supabase";
import { useAutosave } from "../lib/useAutosave";

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

function InputField({ label, value, onChange, type = "text", placeholder = "" }) {
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
    conclusion: patient.conclusion || ""
  };
}

function sessionPayload(session) {
  return {
    occurred_on: session.occurred_on,
    duration_minutes: Number(session.duration_minutes),
    title: session.title || "",
    notes: session.notes || ""
  };
}

function instrumentPayload(instrument) {
  return {
    name: instrument.name || "",
    category: instrument.category || "",
    status: instrument.status || "Pendente",
    scores: instrument.scores || []
  };
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
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [tab, setTab] = useState("anamnese");
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const autosave = useAutosave();
  const switchingPatient = useRef(false);

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
        supabase.from("psico_sessions").select("*").eq("patient_id", selectedId).order("occurred_on", { ascending: true }),
        supabase.from("psico_instruments").select("*").eq("patient_id", selectedId).order("created_at", { ascending: true })
      ]);
      if (cancelled) return;
      if (s.error || i.error) setNotice(s.error?.message || i.error?.message);
      else {
        for (const session of s.data || []) autosave.register("session:" + session.id, sessionPayload(session));
        for (const instrument of i.data || []) autosave.register("instrument:" + instrument.id, instrumentPayload(instrument));
        setSessions(s.data || []);
        setInstruments(i.data || []);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedId, user?.id]);

  function openTab(name) {
    void autosave.flushAll();
    setTab(name);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function selectPatient(id) {
    if (switchingPatient.current) return;
    if (id !== selectedId) {
      switchingPatient.current = true;
      try {
        if (!await autosave.flushAll()) {
          setNotice("Há alterações não salvas. Verifique a conexão ou os campos.");
          return;
        }
        setSelectedId(id);
      } finally {
        switchingPatient.current = false;
      }
    }
    setSearch("");
    openTab("anamnese");
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
    const { data, error } = await supabase.from("psico_patients").insert({ name }).select().single();
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
      setNotice("Paciente excluído.");
    }
    setBusy(false);
  }

  async function addSession() {
    setBusy(true);
    const { data, error } = await supabase.from("psico_sessions").insert({
      patient_id: selectedId,
      occurred_on: new Date().toLocaleDateString("en-CA"),
      title: "Nova sessão",
      notes: ""
    }).select().single();
    if (error) setNotice(error.message);
    else {
      autosave.register("session:" + data.id, sessionPayload(data));
      setSessions(prev => [...prev, data]);
    }
    setBusy(false);
  }

  function changeSession(id, field, value) {
    const next = sessions.map(s => s.id === id ? { ...s, [field]: value } : s);
    setSessions(next);
    const changed = next.find(s => s.id === id);
    if (changed) autosave.track("session:" + id, sessionPayload(changed));
  }

  async function deleteSession(id) {
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
    }
  }

  async function addInstrument() {
    setBusy(true);
    const { data, error } = await supabase.from("psico_instruments").insert({
      patient_id: selectedId, name: "Novo instrumento", status: "Pendente",
      scores: [{ label: "Resultado", value: "" }]
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

  function changeScore(id, position, field, value) {
    updateInstrument(id, i => ({
      ...i,
      scores: (i.scores || []).map((score, index) =>
        index === position ? { ...score, [field]: value } : score)
    }));
  }

  function addScore(id) {
    updateInstrument(id, i => ({ ...i, scores: [...(i.scores || []), { label: "", value: "" }] }));
  }

  function removeScore(id, position) {
    updateInstrument(id, i => ({
      ...i, scores: (i.scores || []).filter((_, index) => index !== position)
    }));
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
  const complete = instruments.filter(i => i.status === "Concluído").length;
  const missing = instruments.filter(i => i.status !== "Concluído").length;
  const latestDate = sessions.length ? sessions[sessions.length - 1].occurred_on : null;

  return (
    <div className="app">
      {menuOpen && <button className="backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
      <aside className={menuOpen ? "side-menu show" : "side-menu"}>
        <div className="brand"><div className="brandmark">PSI</div><strong>Painel Psico</strong></div>
        <div className="side-section">
          <div className="side-label">Pacientes</div>
          <input className="patient-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar paciente" />
          <div className="patient-links" aria-label={search.trim() ? "Resultados da busca" : "Pacientes recentes"}>
            {listed.map(p => <button key={p.id} className={selectedId === p.id ? "patient-link active" : "patient-link"} onClick={() => void selectPatient(p.id)}>{p.name}</button>)}
            {!listed.length && <span className="side-empty">{search.trim() ? "Nenhum resultado" : "Nenhum paciente"}</span>}
          </div>
          <button className="side-add" onClick={() => { setCreating(true); setMenuOpen(false); }}>+ Novo paciente</button>
        </div>
        {form && <nav className="side-nav" aria-label="Seções">
          {[
            ["anamnese", "Anamnese"], ["sessoes", "Sessões"],
            ["instrumentos", "Instrumentos"], ["laudo", "Laudo"]
          ].map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => openTab(key)}>{label}</button>)}
        </nav>}
        <div className="sidebar-footer">
          <button type="button" className={"settings-link" + (tab === "configuracoes" ? " active" : "")}
            aria-current={tab === "configuracoes" ? "page" : undefined}
            onClick={() => openTab("configuracoes")}>Configurações</button>
          <button className="signout" onClick={signOut}>Sair</button>
        </div>
      </aside>

      <main onBlurCapture={() => { if (autosave.isPending()) void autosave.flushAll(); }}>
        <header className="topbar">
          <button className="menu-btn" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}>☰</button>
          <strong>{tab === "configuracoes" ? "Configurações" : form?.name || "Painel Psico"}</strong>
          {tab !== "configuracoes" && <span className={"save-state save-" + autosave.status} aria-live="polite">{saveLabel}</span>}
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

          {tab === "configuracoes" ? <div className="settings-page">
            <div className="hero"><h1>Configurações</h1></div>
            <div className="content-stack">
              {["Configurar Anamneses", "Configurar Sessões", "Configurar Instrumentos"].map(label => (
                <section className="card" key={label}>
                  <div className="cardhead"><h2>{label}</h2></div>
                  <div className="cardbody settings-empty" />
                </section>
              ))}
            </div>
          </div> : !form ? <div className="empty-state">
            <h1>Pacientes</h1>
            <p>Selecione um paciente ou crie um novo registro.</p>
            <button className="btn primary" onClick={() => setCreating(true)}>+ Novo paciente</button>
          </div> : <>
            <div className="hero">
              <h1>{form.name}</h1>
              <div className="actions">
                <span className={"save-state save-" + autosave.status} aria-live="polite">{saveLabel}</span>
                <button className="btn primary" onClick={() => openTab("laudo")}>Abrir laudo</button>
              </div>
            </div>

            <div className="summary">
              <div className="stat"><span>Paciente</span><b>{form.birth_date ? formatDate(form.birth_date) : "Cadastro"}</b></div>
              <div className="stat"><span>Sessões</span><b>{sessions.length}</b></div>
              <div className="stat"><span>Instrumentos</span><b>{complete}/{instruments.length}</b></div>
              <div className="stat"><span>Pendentes</span><b>{missing}</b></div>
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
                  <InputField label="Escolaridade" value={form.grade} onChange={v => setField("grade", v)} />
                  <InputField label="Escola" value={form.school} onChange={v => setField("school", v)} />
                  <InputField label="Responsável entrevistado" value={form.guardian} onChange={v => setField("guardian", v)} />
                  <InputField label="Solicitante" value={form.requester} onChange={v => setField("requester", v)} />
                </div>
              </section>
              <section className="card">
                <div className="cardhead"><h2>Anamnese</h2></div>
                <div className="cardbody">
                  {AREAS.map(([key, label]) => <label className="question" key={key}>
                    <span>{label}</span>
                    <textarea value={anamnese[key] || ""} onChange={e => setAnamnese(key, e.target.value)} />
                  </label>)}
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
                  <div className="session-fields">
                    <InputField label="Data" type="date" value={s.occurred_on} onChange={v => changeSession(s.id, "occurred_on", v)} />
                    <InputField label="Duração (min)" type="number" value={String(s.duration_minutes)} onChange={v => changeSession(s.id, "duration_minutes", v)} />
                  </div>
                  <InputField label="Título" value={s.title} onChange={v => changeSession(s.id, "title", v)} />
                  <label className="question"><span>Observações</span><textarea value={s.notes || ""} onChange={e => changeSession(s.id, "notes", e.target.value)} /></label>
                  <div className="card-actions"><button className="btn danger" onClick={() => void deleteSession(s.id)}>Excluir</button></div>
                </div>)}
              </div>
            </section>}

            {tab === "instrumentos" && <section className="card">
              <div className="cardhead"><h2>Instrumentos</h2><button className="btn soft" disabled={busy} onClick={addInstrument}>+ Adicionar</button></div>
              <div className="cardbody instrument-list">
                {!instruments.length && <p className="muted">Nenhum instrumento registrado.</p>}
                {instruments.map(i => <div className="instrument-entry" key={i.id}>
                  <div className="instrument-head">
                    <InputField label="Instrumento" value={i.name} onChange={v => changeInstrument(i.id, "name", v)} />
                    <AnimatedSelect label="Status" value={i.status} options={["Pendente", "Em andamento", "Concluído"]} onChange={v => changeInstrument(i.id, "status", v)} />
                  </div>
                  <InputField label="Área avaliada" value={i.category} onChange={v => changeInstrument(i.id, "category", v)} />
                  <div className="score-heading">Resultados</div>
                  {(i.scores || []).map((score, position) => <div className="score-edit" key={position}>
                    <input aria-label="Medida" placeholder="Medida" value={score.label || ""} onChange={e => changeScore(i.id, position, "label", e.target.value)} />
                    <input aria-label="Valor" placeholder="Valor" value={score.value || ""} onChange={e => changeScore(i.id, position, "value", e.target.value)} />
                    <button className="mini-delete" onClick={() => removeScore(i.id, position)} aria-label="Remover resultado">×</button>
                  </div>)}
                  <button className="text-btn" onClick={() => addScore(i.id)}>+ Resultado</button>
                  <div className="card-actions"><button className="btn danger" onClick={() => void deleteInstrument(i.id)}>Excluir</button></div>
                </div>)}
              </div>
            </section>}

            {tab === "laudo" && <div className="report-layout">
              <article className="paper">
                <h1>Laudo Psicológico</h1>
                <div className="report-meta">
                  <div><b>Nome:</b> {form.name}</div>
                  {form.birth_date && <div><b>Nascimento:</b> {formatDate(form.birth_date)}</div>}
                  {form.grade && <div><b>Escolaridade:</b> {form.grade}</div>}
                  {form.school && <div><b>Escola:</b> {form.school}</div>}
                  {form.requester && <div><b>Solicitante:</b> {form.requester}</div>}
                  {latestDate && <div><b>Última sessão:</b> {formatDate(latestDate)}</div>}
                </div>
                <h2>1. Descrição da demanda</h2>
                <p>{anamnese.motivo || "Não preenchido."}</p>
                <h2>2. Anamnese</h2>
                {AREAS.filter(([key]) => key !== "motivo").map(([key, label]) => (
                  anamnese[key] ? <div key={key}><h3>{label}</h3><p>{anamnese[key]}</p></div> : null
                ))}
                <h2>3. Observações durante a avaliação</h2>
                {sessions.length ? sessions.map(s => <div key={s.id}><h3>{formatDate(s.occurred_on)}{s.title ? " — " + s.title : ""}</h3><p>{s.notes || "Sem observações."}</p></div>) : <p>Nenhuma sessão registrada.</p>}
                <h2>4. Instrumentos e resultados</h2>
                {instruments.length ? instruments.map(i => <div key={i.id}><h3>{i.name} — {i.status}</h3><p>{[i.category, ...(i.scores || []).filter(s => s.label || s.value).map(s => (s.label || "Resultado") + ": " + (s.value || "—"))].filter(Boolean).join(" · ")}</p></div>) : <p>Nenhum instrumento registrado.</p>}
                <h2>5. Conclusão</h2>
                <p>{form.conclusion || "Pendente de elaboração e revisão pela profissional responsável."}</p>
              </article>
              <aside className="report-tools">
                <div className="card">
                  <div className="cardhead"><h2>Conclusão</h2></div>
                  <div className="cardbody">
                    <textarea value={form.conclusion || ""} onChange={e => setField("conclusion", e.target.value)} placeholder="Redigir conclusão..." />
                    <p className="muted">A conclusão é salva automaticamente.</p>
                    <button className="btn full-btn" onClick={() => window.print()}>Imprimir / PDF</button>
                  </div>
                </div>
                <p className="report-note">Revisar antes de emitir.</p>
              </aside>
            </div>}
          </>}
        </div>
      </main>
    </div>
  );
}
