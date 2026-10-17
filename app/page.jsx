"use client";

import { useEffect, useState } from "react";
import { configured, supabase } from "../lib/supabase";

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

export default function Home() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  useEffect(() => {
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, authSession) => {
      setUser(authSession?.user || null);
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
      setSelectedId(prev => rows.some(p => p.id === prev) ? prev : (rows[0]?.id || null));
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    const patient = patients.find(p => p.id === selectedId);
    setForm(patient ? { ...patient, anamnese: { ...EMPTY_ANAMNESE, ...(patient.anamnese || {}) } } : null);
  }, [patients, selectedId]);

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
      else { setSessions(s.data || []); setInstruments(i.data || []); }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedId, user?.id]);

  function openTab(name) {
    setTab(name);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function signIn(e) {
    e.preventDefault();
    setBusy(true); setNotice("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setNotice(error.message);
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    setTab("anamnese");
  }

  async function createPatient(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
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
    setForm(prev => ({ ...prev, [key]: value }));
  }
  function setAnamnese(key, value) {
    setForm(prev => ({ ...prev, anamnese: { ...prev.anamnese, [key]: value } }));
  }

  async function savePatient() {
    if (!form || !form.name.trim()) { setNotice("Informe o nome do paciente."); return; }
    setBusy(true); setNotice("");
    const values = {
      name: form.name.trim(),
      birth_date: form.birth_date || null,
      grade: form.grade || "",
      school: form.school || "",
      guardian: form.guardian || "",
      requester: form.requester || "",
      anamnese: form.anamnese,
      conclusion: form.conclusion || "",
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from("psico_patients").update(values).eq("id", selectedId).select().single();
    if (error) setNotice(error.message);
    else {
      setPatients(prev => prev.map(p => p.id === data.id ? data : p));
      setNotice("Salvo.");
    }
    setBusy(false);
  }

  async function deletePatient() {
    if (!form || !window.confirm("Excluir o paciente e todos os registros?")) return;
    setBusy(true);
    const { error } = await supabase.from("psico_patients").delete().eq("id", form.id);
    if (error) setNotice(error.message);
    else {
      const remaining = patients.filter(p => p.id !== form.id);
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
    else setSessions(prev => [...prev, data]);
    setBusy(false);
  }

  function changeSession(id, field, value) {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }

  async function saveSession(s) {
    setBusy(true);
    const { error } = await supabase.from("psico_sessions").update({
      occurred_on: s.occurred_on, duration_minutes: Number(s.duration_minutes) || 0,
      title: s.title, notes: s.notes
    }).eq("id", s.id);
    setNotice(error ? error.message : "Sessão salva.");
    setBusy(false);
  }

  async function deleteSession(id) {
    if (!window.confirm("Excluir esta sessão?")) return;
    const { error } = await supabase.from("psico_sessions").delete().eq("id", id);
    if (error) setNotice(error.message);
    else setSessions(prev => prev.filter(s => s.id !== id));
  }

  async function addInstrument() {
    setBusy(true);
    const { data, error } = await supabase.from("psico_instruments").insert({
      patient_id: selectedId, name: "Novo instrumento", status: "Pendente",
      scores: [{ label: "Resultado", value: "" }]
    }).select().single();
    if (error) setNotice(error.message);
    else setInstruments(prev => [...prev, data]);
    setBusy(false);
  }

  function changeInstrument(id, field, value) {
    setInstruments(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  }

  function changeScore(id, position, field, value) {
    setInstruments(prev => prev.map(i => i.id !== id ? i : {
      ...i,
      scores: (i.scores || []).map((score, index) => index === position ? { ...score, [field]: value } : score)
    }));
  }

  function addScore(id) {
    setInstruments(prev => prev.map(i => i.id === id
      ? { ...i, scores: [...(i.scores || []), { label: "", value: "" }] } : i));
  }

  function removeScore(id, position) {
    setInstruments(prev => prev.map(i => i.id === id
      ? { ...i, scores: (i.scores || []).filter((_, index) => index !== position) } : i));
  }

  async function saveInstrument(i) {
    setBusy(true);
    const { error } = await supabase.from("psico_instruments").update({
      name: i.name, category: i.category, status: i.status, scores: i.scores || []
    }).eq("id", i.id);
    setNotice(error ? error.message : "Instrumento salvo.");
    setBusy(false);
  }

  async function deleteInstrument(id) {
    if (!window.confirm("Excluir este instrumento?")) return;
    const { error } = await supabase.from("psico_instruments").delete().eq("id", id);
    if (error) setNotice(error.message);
    else setInstruments(prev => prev.filter(i => i.id !== id));
  }

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

  if (!user) return (
    <div className="center-screen">
      <form className="auth-card" onSubmit={signIn}>
        <div className="logo-icon">PSI</div>
        <h1>Painel Psico</h1>
        <p>Acessar prontuários</p>
        <InputField label="E-mail" type="email" value={email} onChange={setEmail} />
        <InputField label="Senha" type="password" value={password} onChange={setPassword} />
        <button className="btn primary full-btn" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button>
        {notice && <p className="error">{notice}</p>}
      </form>
    </div>
  );

  const listed = patients.filter(p => p.name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
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
          <div className="patient-links">
            {listed.map(p => <button key={p.id} className={selectedId === p.id ? "patient-link active" : "patient-link"} onClick={() => { setSelectedId(p.id); setMenuOpen(false); openTab("anamnese"); }}>{p.name}</button>)}
            {!listed.length && <span className="side-empty">Nenhum paciente</span>}
          </div>
          <button className="side-add" onClick={() => { setCreating(true); setMenuOpen(false); }}>+ Novo paciente</button>
        </div>
        {form && <nav className="side-nav" aria-label="Seções">
          {[
            ["anamnese", "Anamnese"], ["sessoes", "Sessões"],
            ["instrumentos", "Instrumentos"], ["laudo", "Laudo"]
          ].map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => openTab(key)}>{label}</button>)}
        </nav>}
        <button className="signout" onClick={signOut}>Sair</button>
      </aside>

      <main>
        <header className="topbar">
          <button className="menu-btn" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}>☰</button>
          <strong>Avaliação neuropsicológica</strong>
          <span className="account-label">Privado</span>
        </header>

        <div className="content">
          {notice && <div className="notification" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Fechar">×</button></div>}

          {creating && <div className="modal-shade" onClick={() => setCreating(false)}>
            <form className="modal" onSubmit={createPatient} onClick={e => e.stopPropagation()}>
              <h2>Novo paciente</h2>
              <InputField label="Nome" value={newName} onChange={setNewName} />
              <div className="actions"><button type="button" className="btn" onClick={() => setCreating(false)}>Cancelar</button><button disabled={busy || !newName.trim()} className="btn primary">Criar</button></div>
            </form>
          </div>}

          {!form ? <div className="empty-state">
            <h1>Pacientes</h1>
            <p>Selecione um paciente ou crie um novo registro.</p>
            <button className="btn primary" onClick={() => setCreating(true)}>+ Novo paciente</button>
          </div> : <>
            <div className="hero">
              <h1>{form.name}</h1>
              <div className="actions">
                <button className="btn" disabled={busy} onClick={savePatient}>Salvar alterações</button>
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
                    <button className="btn primary" disabled={busy} onClick={savePatient}>Salvar alterações</button>
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
                  <div className="card-actions"><button className="btn primary" disabled={busy} onClick={() => saveSession(s)}>Salvar sessão</button><button className="btn danger" onClick={() => deleteSession(s.id)}>Excluir</button></div>
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
                    <label className="field"><span>Status</span><select value={i.status} onChange={e => changeInstrument(i.id, "status", e.target.value)}><option>Pendente</option><option>Em andamento</option><option>Concluído</option></select></label>
                  </div>
                  <InputField label="Área avaliada" value={i.category} onChange={v => changeInstrument(i.id, "category", v)} />
                  <div className="score-heading">Resultados</div>
                  {(i.scores || []).map((score, position) => <div className="score-edit" key={position}>
                    <input aria-label="Medida" placeholder="Medida" value={score.label || ""} onChange={e => changeScore(i.id, position, "label", e.target.value)} />
                    <input aria-label="Valor" placeholder="Valor" value={score.value || ""} onChange={e => changeScore(i.id, position, "value", e.target.value)} />
                    <button className="mini-delete" onClick={() => removeScore(i.id, position)} aria-label="Remover resultado">×</button>
                  </div>)}
                  <button className="text-btn" onClick={() => addScore(i.id)}>+ Resultado</button>
                  <div className="card-actions"><button className="btn primary" disabled={busy} onClick={() => saveInstrument(i)}>Salvar instrumento</button><button className="btn danger" onClick={() => deleteInstrument(i.id)}>Excluir</button></div>
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
                    <button className="btn primary full-btn" disabled={busy} onClick={savePatient}>Salvar conclusão</button>
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
