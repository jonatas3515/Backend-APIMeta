# Notas de Performance — Casos e Documentos

## 1. Endpoints críticos e padrões observados

### `pages/api/cases.js`

#### Listagem (`GET` sem `id`)
- Query principal faz `select('*, conversations!inner(assigned_user_id)')` trazendo todas as colunas da tabela `cases` mais a coluna `assigned_user_id` da conversa vinculada.
- Filtros são aplicados após o join, o que força o Supabase a resolver a relação mesmo quando a query final será filtrada por usuário não-admin.
- Ordenação por `deadline_date` é feita no banco, evitando sort em memória.
- Oportunidade: selecionar apenas as colunas realmente exibidas no painel (`id`, `title`, `legal_area`, `status`, `priority`, `deadline_date`, `municipality`, `agency`, `client_role`, `conversation_id`, `updated_at`) em vez de `*`.
- Oportunidade: cachear a listagem por alguns segundos usando chave composta por `userId` + hash dos filtros. A tabela de casos não muda a cada requisição, então TTL curto (10s) reduz carga sem risco de dados desatualizados críticos.
- Invalidação: criar, atualizar ou excluir um caso deve limpar as entradas de listagem e detalhe afetadas.

#### Detalhe (`GET` com `id`)
- Usa `select('*, conversations!inner(assigned_user_id)')` e `.maybeSingle()`.
- Verifica autorização comparando `assigned_user_id` com `user.id` (exceto admin).
- Oportunidade: cachear o detalhe por `caseId` por 10–30s, com invalidação no `PATCH` e `DELETE`.
- Não armazenar PII: cache deve conter apenas o payload já autorizado e resumido; nunca nome/telefone de cliente.

#### Criação (`POST`)
- Verifica conversa existente e ativa via `validateConversation` (query simples com `id, client_status`).
- Verifica conflito de conversa já vinculada com `select('id, status, title')`.
- Insere e retorna o registro completo.
- Oportunidade: manter a verificação de conflito, mas invalidar cache de listagem ao concluir.

#### Atualização (`PATCH`)
- Valida desvinculação com `hasPendingOperations` (duas queries em `document_checklist_requests` e `routine_executions`).
- Valida conversa ativa e conflito de vínculo.
- Oportunidade: essas verificações são necessárias para integridade; o cache não deve ser usado para validação, apenas para retorno de listas/detalhes.
- Invalidação: limpar cache de detalhe e listagem quando houver alteração no caso.

---

### `pages/api/generated-documents.js`

#### Listagem por caso (`GET` com `case_id`)
- Faz duas queries quando `conversation_id` é fornecido: documentos diretos do caso e documentos legados vinculados à conversa com `case_id` nulo.
- Usa `select('*, document_templates(name, legal_area)')`, o que expande todas as colunas de `generated_documents` e colunas do template.
- Oportunidade: selecionar apenas colunas exibidas (`id`, `title`, `status`, `generated_at`, `case_id`, `conversation_id`, `template_id`, `is_legacy`) e o `name`/`legal_area` do template.
- Oportunidade: cachear a lista por `caseId` (e `conversationId` quando aplicável) por 5–10s. Invalidar ao gerar, atualizar ou excluir documento.

#### Detalhe por ID (`GET` com `id`)
- Busca por `id` com `select('*, document_templates(name, legal_area)')`.
- Oportunidade: cachear por `documentId` por 10–30s, com invalidação no `PATCH`/`DELETE`.

---

### `pages/api/document-checklist-requests.js`

#### Listagem por caso (`GET`)
- Faz `select('*')` ordenado por `requested_at` descendente.
- Verifica `canAccessCase` com query em `cases`.
- Oportunidade: limitar a `select` às colunas usadas na UI (`id`, `case_id`, `conversation_id`, `items`, `status`, `requested_at`, `requested_by`, `wa_message_id`, `message_template_key`, `batch_number`).
- Oportunidade: cachear a lista por `caseId` por 5–10s. Invalidar ao criar/enviar/reenviar rascunho.

#### Criação/envio (`POST`)
- Criação insere rascunho e retorna o registro.
- Envio/reenvio faz múltiplas atualizações em `case_document_checklists` dentro de um loop. Isso é N+1 dentro do mesmo handler.
- Oportunidade: os updates em `case_document_checklists` podem ser convertidos para uma única chamada RPC ou `upsert` se houver suporte; por ora, invalidar cache de listagem e manter a lógica existente para não alterar schema.

---

### `pages/api/conversations.js`

#### Listagem ativas (`GET`)
- Faz `select('id, client_name, client_phone, client_status, legal_area, updated_at')` sem cache.
- Usado no seletor de conversas; pode ser chamado várias vezes enquanto o usuário navega.
- Oportunidade: cachear lista de conversas ativas por `userId` por 10s. Como o seletor filtra no frontend, manter a lista completa ativa em cache reduz repetições.
- Risco: PII. Nunca cachear `client_name`, `client_phone` ou `client_status`. Cachear apenas `id`, `legal_area`, `updated_at` e, se estritamente necessário, um hash/flag de atividade. No entanto, como o seletor precisa exibir nome e telefone, cachear esses dados violaria a restrição. Portanto, para o seletor, o cache deve ser opcional e conter apenas metadados não sensíveis, ou ainda melhor, não cachear conversas com PII.
- Decisão: o cache de conversas será aplicado apenas para listagens agregadas sem PII, ou desabilitado se os dados sensíveis fizerem parte do payload.

---

### `pages/api/templates.js`

#### Listagem de modelos aplicáveis (`GET` sem `id` e sem `action=generate`)
- Faz `select('*')` filtrado por `legal_area`, `case_type` e `is_active=true`.
- Ordena por `created_at` desc.
- Oportunidade: selecionar `id, name, description, legal_area, case_type, placeholders, is_active` em vez de `*`.
- Oportunidade: cachear a lista por hash dos filtros (`legal_area` + `case_type`) por 30–60s. Templates mudam raramente, então TTL moderado é seguro.
- Invalidação: `POST`, `PATCH` e `DELETE` (soft delete) devem limpar o cache de templates.

---

## 2. Gargalos identificados

1. **`select('*')` em múltiplos endpoints** — sobrecarrega rede e processamento, além de aumentar o risco de vazar colunas não utilizadas.
2. **Joins com `conversations!inner`** — força a materialização da relação para todos os registros, mesmo quando não é necessário exibir dados da conversa.
3. **Loop de updates no envio de documentos** — `document_checklist_requests.js` itera item a item para atualizar status. Pode ser N+1.
4. **Repetição de queries de listagem** — painel refaz listas a cada interação sem cache leve.
5. **Listagem de conversas sem cache** — chamada potencialmente frequente ao abrir o seletor.

## 3. Estratégia de cache leve

- Cache em memória (`Map`) com TTL por chave.
- Chaves prefixadas por recurso (`cases:list:...`, `cases:detail:...`, `generated-docs:list:...`, etc.).
- Sem persistência em disco; volátil por processo.
- Sem PII: nunca cachear nome, e-mail, telefone, conteúdo de mensagens, tokens, URLs assinadas. Cachear apenas dados estritamente necessários ou IDs e metadados.
- Conversas com PII não serão cacheadas; a listagem do seletor continuará consultando o backend a cada abertura, mas isso preserva a privacidade.
- Invalidação ativa nas operações de escrita para manter consistência eventual.

## 4. Próximos ajustes sugeridos

- Migrar `select('*')` para listas explícitas nas próximas iterações de performance.
- Avaliar o uso de funções do Supabase (`rpc`) para o envio de documentos reduzir o loop de updates.
- Monitorar taxa de acerto do cache via métricas (`lib/metrics.js`) sem expor PII.
