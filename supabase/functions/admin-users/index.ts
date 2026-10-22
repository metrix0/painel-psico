import { createClient } from "npm:@supabase/supabase-js@2.118.0";
const ADMIN_ID = "e73094cd-8eb5-473c-802a-1bb0a4866937";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store"
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return reply({ error: "Método não permitido." }, 405);
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return reply({ error: "Faça login primeiro." }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return reply({ error: "Serviço indisponível." }, 503);

  const caller = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await caller.auth.getUser(token);
  if (authError || !user || !user.email_confirmed_at)
    return reply({ error: "Sessão inválida." }, 401);
  if (user.id !== ADMIN_ID)
    return reply({ error: "Somente o administrador pode cadastrar usuários." }, 403);

  let body: unknown;
  try { body = await request.json(); }
  catch { return reply({ error: "Dados inválidos." }, 400); }
  const input = body && typeof body === "object" && "email" in body
    ? (body as { email: unknown }).email : null;
  const email = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    return reply({ error: "Informe um e-mail válido." }, 422);

  // Cryptographic randomness; the initial password is never persisted by the application.
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const password = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    if (/already registered|already exists|already been registered|duplicate/i.test(error.message))
      return reply({ error: "Esse e-mail já possui uma conta." }, 409);
    return reply({ error: "Não foi possível criar a conta: " + error.message }, 400);
  }
  if (!data.user) return reply({ error: "Criação não confirmada." }, 500);
  return reply({ email: data.user.email, password }, 201);
});
