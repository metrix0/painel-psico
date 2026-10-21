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
O laudo é um rascunho produzido por GPT-6.1 Sol a partir dos registros completos e do modelo configurado. A conclusão registrada pela profissional é uma fonte clínica; não é sobrescrita pela geração. Cada versão validada pode ser baixada em DOCX editável ou impressa em PDF.


## Laudos com IA

Após as migrações de anamnese, instrumentos e formulários, aplique `supabase/ai-reports.sql` no projeto dedicado. A função Supabase Edge `report-ai` usa os arquivos em `supabase/functions/report-ai` e `supabase/functions/_shared`; mantenha a verificação JWT habilitada. A chave OpenAI deve existir apenas no Vault do projeto, com o nome `psico_openai_api_key`. Nunca configure essa chave como `NEXT_PUBLIC_*`. O modelo é explicitamente `gpt-6.1-sol`, sem substituição automática.

`Configurações → Configurar Laudos` permite ajustar identificação profissional, título, finalidade e orientações do modelo de seis seções. O modelo segue a estrutura e a apresentação dos laudos de referência (A4, Times New Roman, margens de 2,54 cm). Os documentos de outros pacientes não são usados como exemplos nos pedidos ao modelo.

A geração primeiro salva as alterações pendentes. Um RPC autenticado captura, em uma única consulta, toda a ficha, anamnese e seus modelos, sessões e definições de campos (inclusive arquivados com respostas), instrumentos, tabelas, resultados antigos, perguntas e respostas dos formulários e configuração do laudo. Não há truncamento silencioso; cargas acima do limite são recusadas. Os links públicos dos formulários e identificadores de proprietário não são enviados.

A função inicia uma resposta em segundo plano na OpenAI com JSON Schema estrito. O navegador consulta o andamento e retoma essa consulta ao reabrir a seção. O servidor verifica a estrutura, a identidade, a cobertura exata de sessões e instrumentos, suas datas/durações e as evidências dos literais numéricos. Uma segunda chamada ao mesmo modelo revisa a fidelidade clínica. Falhas exigem correção automática (no máximo duas redações) ou encerram a versão como não validada. Saídas incompletas ou recusadas não viram laudos. As respostas são excluídas da OpenAI após o processamento, em uma tentativa de limpeza; falhas de rede nessa limpeza não invalidam o registro já salvo.

As versões e seus dados de origem são privadas por RLS e somente o servidor pode escrever laudos. Dados alterados depois da geração produzem aviso de versão desatualizada. A prévia e o Word usam a mesma narrativa aceita, com identificação, sessões e tabelas reproduzidas dos dados de origem. Os controles automáticos reduzem erros de estrutura e fidelidade; a psicóloga continua responsável por revisar a interpretação e a conclusão antes da emissão.

Validação local: `npm test` e `npm run build`. Os testes não precisam de chave OpenAI nem de dados de pacientes reais. Testes de integração com o modelo devem usar uma conta temporária e informações inteiramente fictícias.
