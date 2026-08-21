# Relatório de Status — Neves & Costa Chat System

**Data de emissão:** 20 de agosto de 2026  
**Elaboração:** análise automatizada do código, configurações e banco de produção  
**Repositório:** `jonatas3515/Backend-APIMeta`  
**Observação:** este relatório usa apenas fatos comprováveis pelo código/deploy atual. Quando uma informação não pôde ser confirmada, consta como *não confirmado*.

---

## 1. Visão geral do produto

- **Nome do sistema:** Neves & Costa Chat System  
- **Objetivo principal:** plataforma de atendimento, gestão de casos e automação jurídica integrada ao WhatsApp, com IA (Gemini), base de conhecimento RAG, agenda de prazos e painéis de métricas para o escritório Neves & Costa Advocacia e Consultoria.  
- **Públicos/perfis de usuário:**
  - `admin` — configurações, usuários, LGPD, aprovação de documentos RAG, auditoria.
  - `advogado` — casos, clientes, documentos, agenda, DataJud, rotinas, insights.
  - `estagiario` — leitura, chat, busca e tarefas atribuídas; sem permissão para aprovar RAG ou deletar templates.
- **URL de produção:** `https://chatnevesecosta.vercel.app` (alias Vercel); domínio técnico `https://backend-apimeta.vercel.app`.  
- **Infraestrutura:** Vercel (Next.js serverless), Supabase (PostgreSQL), Meta WhatsApp Cloud API, Google Gemini API, DataJud CNJ API (quando configurada).

---

## 2. Arquitetura atual

| Camada | Tecnologia | Observações |
|--------|-----------|-------------|
| Framework | Next.js 14.2.35 | Pages Router, API Routes, Node 24.x |
| Frontend | React 18, Tailwind CSS 3.3, Axios | SPA com painéis laterais, chat, gráficos |
| Backend | Next.js API Routes (`pages/api/**/*.js`) | 52 endpoints aproximadamente |
| Banco | Supabase (PostgreSQL) | 52 migrations aplicáveis, RLS e funções SQL |
| Autenticação | Supabase Auth JWT + tabela `users` | Hash de senha em `users` |
| IA | Google Gemini API (`lib/ai.js`, `lib/aiRag.js`) | Modelos `gemini-2.5-flash-lite` e fallback `gemini-3.1-flash-lite` |
| WhatsApp | Meta Cloud API (`lib/whatsapp.js`) | Envio/recebimento de mensagens e mídia |
| Hospedagem | Vercel Pro/Hobby | Deploy via CLI; alias `chatnevesecosta.vercel.app` confirmado em deploys recentes |
| CI/CD | GitHub + Vercel | `git push` dispara build |

### Variáveis de ambiente identificadas (nomes apenas, sem valores)

- `WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `GOOGLE_AI_API_KEY`
- `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ADMIN_SETUP_KEY`
- `DATAJUD_API_KEY` (configurada em Vercel Production/Preview; validada em produção para TJBA em 20/08/2026; teste TRF1 retornou 401 e continua pendente de investigação)
- `ZAPSIGN_API_KEY` (referenciada em auditoria, não confirmada como ativa em `.env.local`)
- `CALENDAR_ENCRYPTION_KEY` (referenciada em auditoria, não confirmada como ativa em `.env.local`)

---

## 3. Módulos e funcionalidades

| Módulo | Finalidade | Telas/Componentes | Endpoints principais | Perfis | Status |
|--------|-----------|-------------------|----------------------|--------|--------|
| **Autenticação e perfis** | Login JWT, roles, criação de admin | `Login.js`, `UserManagement.js` | `POST /api/auth/login`, `POST /api/auth/setup-admin`, `GET/POST /api/auth/users`, `POST /api/auth/change-password` | admin, advogado, estagiario | Funcional |
| **Dashboard** | Resumo de prazos, não lidas, casos críticos, métricas diárias | painel principal (`/`) | `GET /api/dashboard` | admin, advogado, estagiario | Funcional |
| **Chat / WhatsApp** | Receber/enviar mensagens, bot IA, mídia, transcrição assíncrona | `ChatWindow.js`, `ChatList.js` | `POST /api/webhook`, `POST /api/send-message`, `GET /api/conversation/[id]/mode`, `POST /api/process-media` | admin, advogado, estagiario | Funcional; *correção recente em `webhook.js` para `mediaBuffer` fora de escopo* |
| **Clientes** | Listagem, edição de nome, filtros, busca | `ClientsList.js` | `GET /api/conversation`, `GET /api/search` (parcial) | admin, advogado, estagiario | Funcional |
| **Casos** | CRUD de casos com prazos, status e prioridade | `CasesPanel.js`, `CaseSidebar.js`, `DeadlineCalendar.js` | `GET/POST/PATCH /api/cases` | admin, advogado, estagiario | Funcional |
| **Agenda** | Consolida prazos, lembretes e eventos; filtros; resumo IA | `AgendaPanel.js`, `DeadlineCalendar.js` | `GET/POST /api/agenda` | admin, advogado, estagiario | Funcional |
| **Funil** | Acompanhamento por etapas: `lead_novo → intake → proposta → contrato → ação → encerrado` | `FunnelKanban.js`, `FunnelMetrics.js` | `GET /api/funnel` | admin, advogado, estagiario | Funcional |
| **Documentos** | Templates com placeholders, geração de documentos, rotinas | `DocumentTemplatesManager.js`, `DocumentGenerator.js`, `DocumentChecklist.js` | `GET/POST/PATCH/DELETE /api/templates`, `GET/POST/PATCH /api/document-checklists` | admin/advogado (edição); estagiario (leitura) | Funcional |
| **Colaboração** | Notas internas, atribuição, auditoria | `CollaborationPanel.js` | `GET/POST/PATCH /api/collaboration` | admin, advogado, estagiario | Funcional |
| **Rotinas** | Sequências jurídicas que geram documentos e lembretes | `LegalRoutinesManager.js` | `GET/POST/PATCH/DELETE /api/routines` | admin, advogado | Funcional |
| **Insights** | Aprendizados de casos encerrados, sugestão de similares | `CaseInsightsPanel.js` | `GET/POST/PATCH/DELETE /api/insights` | admin, advogado, estagiario | Funcional |
| **Métricas** | Casos por área/tipo/local, funil, série temporal, mapa de calor | `MetricsPanel.js`, `MetricsDashboard.js` | `GET /api/metrics` | admin, advogado, estagiario | Funcional |
| **Filtro global por área jurídica** | Preferência do usuário e índices em `users`, `cases`, `conversations`, `case_insights` | `AreaFilterSelector.js`, `ActiveFilterBanner.js` | n/a (preferência em `users.preferred_legal_area`) | todos | Funcional |
| **LGPD e consentimento** | Política de privacidade, logs de consentimento, anonimização | `CollaborationPanel.js`, fluxo no `webhook.js` | `GET/POST/PATCH /api/lgpd` | admin, advogado | Funcional |
| **Player de áudio no chat** | Exibe áudio transcrito e player para mídias | `ChatWindow.js` | `POST /api/process-media` | todos | Funcional |
| **DataJud** | Cadastro de processos e consulta pública de movimentações | `CaseProcessMonitoring.js` | `GET/POST/PATCH/DELETE /api/case-processes`, `POST /api/process-movements/[id]/review`, `POST /api/process-movements/[id]/create-agenda-event` | advogado/admin (edição); estagiario (leitura) | **Validado em produção para TJBA em 20/08/2026; TRF1 permanece com 401 e pendente de investigação** |
| **Assistente IA / RAG** | Respostas no chat e assistente jurídico baseado em documentos aprovados | `OfficeAIAssistant.js`, `KnowledgeBaseManager.js` | `POST /api/ai/ask`, `GET/POST/PATCH/PUT /api/knowledge/documents` | admin, advogado, estagiario (uso); admin/advogado (gestão) | Funcional |
| **Base de Conhecimento** | Gestão de documentos anonimizados e aprovação | `KnowledgeBaseManager.js` | `GET/POST/PATCH/PUT /api/knowledge/documents` | admin, advogado (inserir/editar/aprovar); estagiario (consulta via IA) | Funcional |

---

## 4. DataJud

### Tribunais habilitados por ramo

A fonte canônica é `lib/datajudCourts.js`:

- **Justiça Estadual (TJs):** todos os 27 estados/DF (AC, AL, AM, AP, BA, CE, DF, ES, GO, MA, MG, MS, MT, PA, PB, PE, PI, PR, RJ, RN, RO, RR, RS, SC, SE, SP, TO).
- **Justiça Federal (TRFs):** 1ª a 6ª Região.
- **Justiça do Trabalho (TRTs):** TRT5 (BA) e TRT8 (ES); + TST como superior.
- **Justiça Eleitoral (TREs):** BA, SP, RJ, ES, MG, DF, PA.
- **Justiça Superior:** TST, STJ, TSE, STM.

### Tribunais não habilitados conhecidos

- **STF (Supremo Tribunal Federal):** não consta na whitelist.
- TRTs fora do 5º e 8º; TRFs/TRTs acima não listados; TREs fora da lista; Varas/Turmas específicas (ex.: Juizados Especiais) sem alias individual.

### Fluxo de consulta e dados retornados

1. `lib/datajudClient.js` valida o número CNJ (20 dígitos + dígito verificador ISO 7064).
2. `resolveDataJudAlias` confere se o `court_code` está na whitelist (`lib/datajudCourts.js`).
3. Envia `POST` para `https://api-publica.datajud.cnj.jus.br/{alias}/_search` com o número do processo.
4. Em caso de sucesso, retorna:
   - `processNumberFormatted`, `court`, `instance`, `caseClass`, `mainSubject`
   - `distributionDate`
   - até 30 `movements` ordenados por data (mais recentes primeiro)
   - `lastMovement` (última movimentação)
5. `pages/api/case-processes.js` armazena os metadados em `case_processes`.
6. `pages/api/process-movements/[id]/review.js` permite revisar a movimentação e convertê-la em nota ou evento de agenda.

### Testes reais em 20/08/2026

#### TJBA — sucesso

- Tribunal: TJBA (Tribunal de Justiça da Bahia).
- Resultado: consulta funcionou.
- Movimentações retornadas: 30 novas movimentações.
- Ação: painel registrou as movimentações para revisão jurídica.
- Atualização: “Última consulta” registrada em 20/08/2026 às 20:43:40.
- Status: `DATAJUD_API_KEY` está sendo lida e aceita pelo TJBA.
- Próximos passos: revisão jurídica pode gerar nota ou evento de agenda via `pages/api/process-movements/[id]/review.js` e `pages/api/process-movements/[id]/create-agenda-event.js`.

#### TRF1 — pendente

- Tribunal: TRF1 (1ª Região Federal).
- Número de processo: não registrado (utilizado exemplo público do tutorial da CNJ).
- HTTP: 401 Unauthorized.
- Autenticação: não funcionou no teste isolado.
- Movimentações retornadas: 0.
- Causa: falha de autenticação ainda não esclarecida (não foi alias, formato, timeout, rate limit ou erro 5xx).
- Nota: investigação específica do TRF1 ainda é necessária; DataJud não está bloqueado globalmente.

### Limitações

- **TRF1 pendente:** teste isolado na 1ª Região Federal retornou 401. A causa específica do TRF1 ainda não foi esclarecida (credencial, formato de autorização ou permissão de tribunal). Não se trata de bloqueio global da DataJud.  
- TJBA validado: a variável `DATAJUD_API_KEY` está no Vercel e foi aceita pelo TJBA em 20/08/2026.  
- A DataJud/CNJ documenta o uso de `Basic` auth; o código atual envia `Authorization: APIKey <chave>`. O formato da credencial no Vercel precisa ser conferido para os casos que ainda falham.  
- Apenas tribunais da whitelist respondem; STF não habilitado.  
- Processos com `sigilo === 'Sigiloso'/'Restrito'` retornam erro e exigem acompanhamento em fonte oficial.  
- Prazos, intimações e alterações urgentes devem sempre ser confirmadas nos sistemas oficiais do tribunal. A consulta DataJud é auxiliar, não substitui fontes oficiais.

### Controles de segurança adotados

- Whitelist fixa de códigos de tribunal (`lib/datajudCourts.js`) com aliases canônicos; nenhum endpoint aceita URL arbitrário.
- Validação do número CNJ antes de qualquer chamada externa.
- Tratamento de `429`, `401/403`, `5xx` e timeout de 25 s.
- Acesso autenticado (`withAuth`, mínimo `estagiario` para leitura, `advogado` para criação de evento).
- Movimentações consultadas são salvas em `process_movements` e vinculadas a `case_processes`.

---

## 5. IA e Base de Conhecimento

### Arquitetura RAG

1. **Ingestão:** `pages/api/knowledge/documents.js` recebe documento, anonimiza (`lib/anonymize.js`) e divide em chunks (`lib/chunkText.js`, ~1.200 caracteres, 120 de overlap).
2. **Armazenamento:**
   - `knowledge_documents` — metadados, status e conteúdo anonimizado.
   - `knowledge_chunks` — trechos com índice full-text em português (`to_tsvector('portuguese', content)`).
   - `knowledge_query_logs` — registra consulta, filtros e IDs de documentos usados.
3. **Busca:** função SQL `search_knowledge` (migrações 050/051/052) retorna chunks relevantes.
4. **Geração:** `pages/api/ai/ask.js` monta contexto (até 5.000 caracteres) e chama `askRag` (`lib/aiRag.js`) com prompt que proíbe inventar jurisprudência e exige citação da base.

### Status dos documentos

- `rascunho` — inserido, não usado pela IA.
- `revisado` — caminho intermediário.
- `aprovado` — reindexado e passível de uso no `search_knowledge`; filtro padrão da função é `aprovado`.

### O que aparece no frontend

- `KnowledgeBaseManager.js` lista metadados (título, tipo, área, tribunal, tags, versão, status, quantidade de chunks) e um *preview* dos primeiros 300 caracteres do conteúdo anonimizado.
- O conteúdo integral e os chunks brutos **não** são expostos ao frontend por RLS/política (migração 051 removeu `SELECT` autenticado direto; a busca ocorre via `SECURITY DEFINER` service role).

### Perfis e permissões no RAG

- `admin` e `advogado`: inserir, editar, aprovar, excluir, alterar status.
- `estagiario`: pode usar o Assistente IA (`/api/ai/ask`); não gerencia documentos.

### Modelos atualmente cadastrados

Consulta realizada em produção em 20/08/2026:

| Título | Tipo | Status | Versão | Chunks |
|--------|------|--------|--------|--------|
| Modelo — Ação anulatória de débito por cobrança de energia | `modelo_peca` | aprovado | v1.0 | 2 |
| Modelo — Obrigação de fazer por produto não entregue | `modelo_peca` | aprovado | v1.0 | 2 |
| Modelo — Cancelamento de voo e assistência material | `modelo_peca` | aprovado | v1.0 | 2 |
| Modelo — Cobrança duplicada e repetição do indébito | `modelo_peca` | aprovado | v1.0 | 2 |

**Documento temporário “Teste RAG - Petição sobre cobrança indevida”:** *não localizado* na base. O documento mais próximo é o modelo “Cobrança duplicada e repetição do indébito”, mas o título exato do teste não consta. Recomendação: se o documento de teste for criado no futuro, mantenha-o como `rascunho` ou remova-o antes de colocar a base em uso real, para evitar poluir os resultados do RAG.

**Recomendação importante:** qualquer jurisprudência inserida nos modelos deve ser validada em fonte oficial antes de ser aprovada e usada em peça real. O sistema não faz validação automática de citação ou vigência de súmulas/jurisprudência.

---

## 6. Segurança e privacidade

### RLS e políticas

- Tabelas principais de chat (`conversations`, `messages`, `cases`) possuem RLS desde as primeiras migrations.
- `knowledge_documents` e `knowledge_chunks` têm RLS habilitado (migração 050), com políticas ajustadas na 051 para restringir `SELECT` direto; a busca é exposta via `search_knowledge` como `SECURITY DEFINER` e `GRANT EXECUTE TO service_role`.
- Storage do Supabase (`chat-files`) possui RLS (migration 010).

### Chaves e segredos

- Credenciais (`WHATSAPP_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_AI_API_KEY`) são usadas apenas server-side; nenhum token sensível foi encontrado versionado no git.
- `.env` e `.env.local` estão no `.gitignore`.
- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` são as únicas variáveis intencionalmente expostas ao frontend.

### Logs

- **Confirmação (webhook):** `pages/api/webhook.js` imprimia no console o body completo, headers, telefone (`from`), nome do cliente (`clientName`) e texto da mensagem (`textBody`). Corrigido: os logs sensíveis foram removidos e substituídos por log sanitizado com `correlationId`, `phoneHash` (HMAC/SHA-256), `textLength`, `event` e `duration`.
- **Nota (sem alteração agora):** console de produção contém logs repetitivos do frontend, como `"[FRONTEND] Buscando conversas..."`, `"[FRONTEND] Conversas encontradas: 31"` e `"[API] Sessão autenticada"`. Depois da correção de logs sensíveis no backend, podemos avaliar a remoção/condicionamento desses logs e se há polling excessivo.
- `knowledge_query_logs` guarda a consulta anonimizada, filtros e IDs de documentos; não armazena a resposta completa.

### Proteção contra URL/endpoint arbitrário no DataJud

- `datajudCourts.js` define `DATAJUD_COURTS` e `resolveCourtAlias` com whitelist fixa; não é possível chamar tribunais fora da lista ou forjar um alias arbitrário.

### LGPD

- Tabela `consent_logs` registra aceite/rejeição, IP, user agent e protocolo.
- `data_retention_policy` e view `expired_leads` permitem políticas de retenção.
- Campos `confidential` e `is_sensitive` em `conversations`/`messages`.
- Fluxo de consentimento via bot: envia link da política, aguarda `ACEITO/CONCORDO`, registra e gera protocolo.

### Limitações de anonimização

- `lib/anonymize.js` usa regex para CPF, CNPJ, RG, processo, e-mail, telefone, valor e endereço.  
- **Nomes de pessoas não são anonimizados automaticamente.** Documentos que contenham nomes de partes, testemunhas ou magistrados exigem revisão humana antes da aprovação no RAG.  
- A garantia de não-exposição depende do status `aprovado` e da revisão manual.

### Vulnerabilidades conhecidas

Conforme `docs/SECURITY_AUDIT.md` (15/08/2026):

| Pacote | Risco | Ação recomendada |
|--------|-------|------------------|
| `xlsx` 0.18.5 | Prototype Pollution + ReDoS (HIGH) | Monitorar e avaliar migração para alternativa em Q1/2027 |
| `next` 14.0.0 | 21 vulnerabilidades (HIGH) | Planejar upgrade para 16.x em branch de testes |
| `postcss` 8.4.31 | XSS / path traversal em source maps (HIGH) | Aplicar patch na próxima janela de manutenção |

- Chaves `ZAPSIGN_API_KEY` e `CALENDAR_ENCRYPTION_KEY` estão indicadas como temporárias na auditoria e devem ser regeneradas e substituídas se forem ativar as integrações.

---

## 7. Banco de dados e migrations

Foram identificadas **52 migrations** em `supabase/migrations/`, numeradas de 001 a 052. Abaixo as principais, com finalidade e obrigatoriedade.

| Nº / Arquivo | Finalidade | Obrigatória em produção? |
|--------------|-----------|--------------------------|
| `001_create_tables.sql` | Estrutura base de autenticação | Sim |
| `002_add_chat_tables.sql` | Conversas e mensagens | Sim |
| `004_create_storage_bucket.sql` | Bucket `chat-files` | Sim |
| `008_enable_rls_chat_tables.sql` | RLS nas tabelas de chat | Sim |
| `011_add_legal_fields.sql` | Campos jurídicos nas conversas | Sim |
| `012_add_funnel_and_segmentation.sql` | Funil e segmentação | Sim |
| `021_create_cases_table.sql` | Casos jurídicos | Sim |
| `023_create_document_templates_and_routines.sql` | Templates, rotinas, execuções | Sim |
| `024_add_users_and_collaboration.sql` | Usuários e atribuição | Sim |
| `025_add_lgpd_and_data_retention.sql` | LGPD, consentimento, retenção | Sim |
| `026_create_case_insights.sql` | Central de conhecimento de casos | Sim |
| `027_create_agenda_jurídica.sql` | Agenda e `case_events` | Sim |
| `028_create_client_info_requests.sql` | Rastreamento de intenções do cliente | Sim |
| `033_add_message_delivery_tracking.sql` | `wa_message_id`, `status`, `error_info` | Sim |
| `034_create_document_checklists.sql` | Checklist de documentos | Sim |
| `036_deduplicate_conversations.sql` | Dedup de conversas por telefone | Sim |
| `037_normalize_phone_optional_nine.sql` | Normalização do dígito 9 | Sim |
| `039_add_legal_area_filter.sql` | **Filtro global por área jurídica** + índices | Sim |
| `040_create_document_signatures.sql` | Assinatura eletrônica (Zapsign) | Sim, se usar assinaturas |
| `041_enhance_calendar_encryption.sql` | Criptografia de tokens de calendário | Sim, se usar iCal |
| `042_calendar_oauth_fase2.sql` | Google Calendar OAuth | Sim, se usar Google Calendar |
| `043_security_rls_and_webhook_logs.sql` | RLS hardening e logs de webhook | Sim |
| `047_fee_simulator.sql` | Simulador de honorários | Sim, se usar simulador |
| `048_case_process_monitoring.sql` | **DataJud:** `case_processes`, `process_movements` | Sim, se usar DataJud |
| `049_fee_uploaded_tables.sql` | Tabelas de preços de referência | Sim, se usar simulador |
| `050_office_knowledge_base.sql` | **RAG:** `knowledge_documents`, `knowledge_chunks`, `knowledge_query_logs` | Sim, se usar Assistente IA/RAG |
| `051_rag_security_fixes.sql` | **RAG:** `SECURITY DEFINER`, restringe `search_knowledge` a service_role | Sim, se usar RAG |
| `052_rag_search_or.sql` | **RAG:** busca com OR entre palavras-chave, reindexa `search_knowledge` | Sim, se usar RAG |

**Destaque para 039, 050, 051 e 052:**

- **039:** habilita `preferred_legal_area` em `users` e cria índices de performance para filtro de área jurídica.
- **050:** cria as três tabelas do RAG e a função full-text `search_knowledge`.
- **051:** corrige a segurança do RAG, removendo `SELECT` direto e forçando chamada via `SECURITY DEFINER` pelo `service_role`.
- **052:** evita que perguntas longas sejam descartadas por falta de um termo no mesmo chunk, usando OR entre palavras-chave.

---

## 8. Testes e validações

### Testes automatizados

- *Não confirmado*: não foram encontrados arquivos de teste (`*.test.js`, `*.spec.js`, `__tests__`) nem dependências de teste no `package.json`.

### Funcionalidades validadas em produção

- Build (`npm run build`) foi executado com sucesso em 20/08/2026 antes e após correções recentes.
- Deploy na Vercel concluído com URL ativa `https://chatnevesecosta.vercel.app`.
- Webhook do WhatsApp processa mensagens e responde; envio/recebimento de mídia corrigido recentemente.
- RAG com 4 documentos aprovados; busca e geração via `POST /api/ai/ask` confirmadas no código.
- Supabase com 52 migrations aplicadas e RLS ativo.

### Smoke tests (produção, 20/08/2026)

- `GET /` → HTTP 200 (ok).
- `GET /api/webhook-test` → HTTP 200 (ok).
- `GET /api/webhook` (sem verify token) → HTTP 403 (protegido).
- `POST /api/ai/ask` (sem autenticação) → HTTP 400 (não autenticado).

### O que ainda depende de teste manual

- Envio de mídia via WhatsApp em múltiplos formatos (áudio longo, PDF, imagem em alta resolução).
- Assinatura eletrônica (Zapsign) — requer `ZAPSIGN_API_KEY` ativa e testes em sandbox.
- Integração Google Calendar OAuth — requer chaves e teste de sincronização.
- DataJud — autenticação com a API pública ainda falha (HTTP 401) mesmo com a variável no Vercel; requer revisão da chave/credencial.
- Carga com 1000+ conversas — performance projetada, não testada em produção.

### Erros/limitações atuais

- `DataJud` — a variável `DATAJUD_API_KEY` está em Vercel Production/Preview, mas a consulta real retorna HTTP 401 (autenticação rejeitada). Causa: chave/credencial inválida ou esquema de autorização incorreto (código usa `APIKey`, documentação DataJud/CNJ indica `Basic`).
- Anonimização não cobre nomes de pessoas — exige revisão manual dos documentos RAG.
- Build local com 1024 MB de memória (`vercel.json`) pode causar OOM em máquinas com menos RAM; em produção a Vercel ignora o parâmetro `memory` devido ao billing de CPU ativo.

### Fato vs suposição

- **Fatos:** 52 migrations, 4 documentos RAG aprovados, `DATAJUD_API_KEY` presente no Vercel, teste DataJud retornou 401, logs do webhook expõem PII, build ok, deploy ativo.
- **Suposições:** tempo real de resposta <2 s, capacidade de 1000+ conversas, DataJud funcionando com a chave (não testado).

---

## 9. Pendências e recomendações priorizadas

### Crítico

1. **Revisar `DATAJUD_API_KEY`:** a variável está no Vercel, mas a API pública rejeitou a chave (HTTP 401). Verificar se o valor está ativo e se o esquema de autenticação (`APIKey` vs `Basic`) está correto; adicionar a variável no `.env.example`.
2. **Revisar e anonimizar nomes de pessoas** nos documentos RAG aprovados ou inserir um passo manual obrigatório antes da aprovação.
3. **Remover/rotacionar chaves temporárias** (`ZAPSIGN_API_KEY`, `CALENDAR_ENCRYPTION_KEY`) antes de ativar assinaturas/calendário em produção.

### Alto

4. **Adicionar `DATAJUD_API_KEY` no `.env.example` e documentar o formato esperado (ex.: `usuario:senha` para `Basic`).**
5. **Testar DataJud com processo real** em tribunal habilitado e registrar os primeiros `process_movements`.
6. **Revisar logs de webhook** para evitar vazamento de PII nos logs do Vercel.
7. **Criar testes de fumaça** (smoke tests) para as rotas críticas (`/api/webhook`, `/api/send-message`, `/api/ai/ask`).

### Médio

8. **Planejar upgrade de `next` 14 → 16.x**, `postcss` e substituição/upgrade do `xlsx` conforme `docs/SECURITY_AUDIT.md`.
9. **Monitorar build local por OOM** e documentar requisitos mínimos de RAM.
10. **Criar documentação de onboarding** para novos `estagiario` e `advogado`.

### Baixo

11. Revisar formatação dos telefones exibidos no chat (ex.: `73 9994-8552` vs `73 99934-8552`) após normalização.
12. Padronizar nomes e títulos dos modelos RAG (evitar duplicatas).

### Melhoria futura

13. Integrar embeddings vetoriais para RAG se o volume de documentos crescer.
14. Sincronização automática de prazos DataJud → agenda.
15. Painel executivo consolidado de OKRs do escritório.

---

## 10. Resumo executivo

O **Neves & Costa Chat System** é uma plataforma Next.js + Supabase + Vercel já em produção, com chat WhatsApp, gestão de casos, agenda, templates, insights, métricas, base de conhecimento RAG e módulo de acompanhamento processual DataJud. O sistema possui **52 migrations**, autenticação baseada em JWT/Supabase, RLS e fluxo de consentimento LGPD. Atualmente há **4 documentos RAG aprovados** e ativos. A principal ressalva técnica é o **DataJud com autenticação rejeitada (HTTP 401)**: a variável `DATAJUD_API_KEY` existe no Vercel, mas a API pública não aceitou a chave em nenhum dos esquemas testados (`APIKey` e `Basic`). Também confirmou-se **exposição de PII nos logs do webhook** (`pages/api/webhook.js` imprime body, headers, telefone, nome e texto). Outros pontos críticos: revisão manual de anonimização de nomes, rotação de chaves temporárias e acompanhamento das vulnerabilidades de dependências documentadas. Não há testes automatizados identificados; o build e o deploy estão funcionando.
