"use client";
import { useState } from "react";
import { supabase } from "../lib/supabase";
const ADMIN_ID = "e73094cd-8eb5-473c-802a-1bb0a4866937";

export default function UserAccessSettings({ user }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [changing, setChanging] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState("");

  async function createAccount(event) {
    event.preventDefault();
    if (loading || !supabase) return;
    setLoading(true); setNotice(""); setCredentials(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { email: email.trim().toLowerCase() }
      });
      if (error) {
        let msg = error.message;
        try { const response = await error.context?.json?.(); if (response?.error) msg = response.error; }
        catch { /* Keep the HTTP error message. */ }
        throw new Error(msg);
      }
      if (!data?.email || !data?.password) throw new Error("Resposta de criação inválida.");
      setCredentials({ email: data.email, password: data.password });
      setEmail("");
      setNotice("Conta criada. Compartilhe a senha inicial em particular.");
    } catch (err) {
      setNotice(err.message || "Não foi possível criar a conta.");
    } finally { setLoading(false); }
  }

  async function updatePassword(event) {
    event.preventDefault();
    if (changing || !supabase) return;
    if (password.length < 12) return setPasswordNotice("Use pelo menos 12 caracteres.");
    if (password !== confirm) return setPasswordNotice("As senhas não coincidem.");
    setChanging(true); setPasswordNotice("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setPasswordNotice(error.message);
    else { setPassword(""); setConfirm(""); setPasswordNotice("Senha atualizada."); }
    setChanging(false);
  }

  return <>
    {user?.id === ADMIN_ID && <section className="card">
      <div className="cardhead"><h2>Usuários</h2></div>
      <div className="cardbody">
        <p className="muted">Cadastre usuários com uma senha temporária, sem enviar convite por e-mail.</p>
        <form className="user-access-form" onSubmit={createAccount}>
          <label className="field"><span>E-mail do novo usuário</span>
            <input type="email" maxLength={254} required autoComplete="off" value={email}
              onChange={e => { setEmail(e.target.value); setCredentials(null); setNotice(""); }}
              placeholder="email@exemplo.com" />
          </label>
          <button className="btn primary" disabled={loading || !email.trim()}>
            {loading ? "Criando..." : "Criar usuário sem convite"}
          </button>
        </form>
        {notice && <p className="user-access-notice" role="status">{notice}</p>}
        {credentials && <div className="user-access-credentials">
          <strong>Credenciais iniciais — exibidas apenas uma vez</strong>
          <div><span>E-mail</span><code>{credentials.email}</code></div>
          <div><span>Senha temporária</span><code>{credentials.password}</code></div>
          <button className="btn soft" type="button" onClick={() =>
            navigator.clipboard?.writeText?.("E-mail: " + credentials.email + "\nSenha temporária: " + credentials.password)
          }>Copiar acesso</button>
          <p>Compartilhe por um canal privado. A pessoa poderá trocar a senha em Configurações.</p>
        </div>}
      </div>
    </section>}
    <section className="card">
      <div className="cardhead"><h2>Minha senha</h2></div>
      <div className="cardbody">
        <p className="muted">Troque a senha enquanto estiver conectado, sem e-mail de recuperação.</p>
        <form className="user-access-form" onSubmit={updatePassword}>
          <label className="field"><span>Nova senha</span><input type="password" required minLength={12}
            autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
          <label className="field"><span>Confirmar senha</span><input type="password" required minLength={12}
            autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
          <button className="btn primary" disabled={changing || !password || !confirm}>
            {changing ? "Alterando..." : "Alterar senha"}
          </button>
        </form>
        {passwordNotice && <p className="user-access-notice" role="status">{passwordNotice}</p>}
      </div>
    </section>
  </>;
}
