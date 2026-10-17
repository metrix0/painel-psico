# Painel Psico

Aplicativo privado para uso de uma profissional (Next.js + Supabase). Sem dados fictícios.

## Configuração

1. Crie ou selecione **um projeto Supabase dedicado** (não use o banco do iMenu).
2. Execute \`supabase/schema.sql\` uma vez no SQL Editor desse projeto.
3. Ative Email/Password no Supabase Auth, desabilite inscrições públicas e crie o login da profissional no Dashboard.
4. Configure no Vercel \`NEXT_PUBLIC_SUPABASE_URL\` e \`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\` para production/preview.
5. Reimplante o projeto no Vercel após adicionar variáveis.

Não use chave service_role nem segredos no navegador. Não inclua dados de pacientes reais no repositório.

## Fluxo

Login → selecionar/criar paciente → Anamnese / Sessões / Instrumentos → Laudo.
Os dados são salvos no Supabase com isolamento por usuário via RLS.
O laudo reúne apenas informações registradas; a conclusão é editada pela profissional. Exportação PDF usa a impressão do navegador.

