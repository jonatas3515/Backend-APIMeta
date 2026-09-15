# Projeto Técnico: Persistência Segura e Temporária do Estado da Simulação Trabalhista

## Objetivo

Definir, sem implementar, como manter o `state` do fluxo de cálculo de verbas trabalhistas entre mensagens do WhatsApp de forma segura, temporária e compatível com LGPD, RLS, auditoria e a arquitetura Vercel/Supabase existente.

## Estado atual

- O `adaptLaborSettlement` em `lib/laborSettlementAdapter.js` é puro: recebe `message` e `state`, e devolve `state` atualizado.
- Nenhuma persistência existe hoje. O chamador é responsável por manter o `state`.
- O `state` contém:
  - `active`, `intent`, `collected`, `askedFields`, `status`
- `collected` pode conter:
  - `salary`, `admissionDate`, `terminationDate`, `terminationReason`, `hasVacationAccrued`, `hasThirteenthAccrued`, `noticeStatus`
- Esses dados são PII/potencialmente sensíveis (especialmente salário e datas).

## Restrições do projeto

- Vercel serverless (stateless, multi-replica, cold start).
- Supabase/PostgreSQL com RLS e service role no backend.
- Tabela `conversations` já existe com `ON DELETE CASCADE` em filhas.
- Já existe infraestrutura de auditoria (`audit_logs`, `log_audit`), LGPD (`data_retention_policy`, `anonymized_data`, `consent_logs`) e `users` com papéis.
- O backend já usa `SUPABASE_SERVICE_ROLE_KEY`, portanto bypassa RLS nas APIs serverless.
- O bot não deve armazenar texto integral das mensagens do usuário nem o resultado do cálculo sem necessidade.

## Dados a proteger

| Dado | Sensibilidade | Razão |
|---|---|---|
| `salary` | Alta | Remuneração do cliente |
| `admissionDate` | Alta | Vínculo empregatício |
| `terminationDate` | Alta | Vínculo empregatício |
| `terminationReason` | Média | Contexto do desligamento |
| `hasVacationAccrued` | Baixa | Boolean/enum |
| `hasThirteenthAccrued` | Baixa | Boolean/enum |
| `noticeStatus` | Baixa | Enum |
| `calculation` | Média | Resultado estimado; não é valor definitivo |

## Opções avaliadas

### 1. Memória local do processo/serverless

- **Vantagens:** nenhum I/O externo, latência zero, fácil de testar.
- **Desvantagens:** perde estado a cada cold start/redeploy; múltiplas réplicas não compartilham memória; WhatsApp pode reordenar webhooks.
- **Conclusão:** inviável para produção em Vercel.

### 2. Estado no frontend

- **Vantagens:** nenhuma alteração no banco.
- **Desvantagens:** WhatsApp não permite manter state no cliente de forma confiável; mobile pode reiniciar contexto; PII trafegaria pelo cliente.
- **Conclusão:** inviável para webhook do WhatsApp.

### 3. Reutilizar `conversations.intake_data` JSONB

- **Vantagens:** nenhuma migration nova; já existe coluna JSONB.
- **Desvantagens:** mistura dados temporários de simulação com intake real do funil; `intake_data` pode ser exportado para relatórios/triagem; sem TTL automático; sem versionamento; exclusão parcial é difícil.
- **Conclusão:** não recomendado por contaminação de escopo e dificuldade de expiração.

### 4. Tabela específica com TTL

- **Vantagens:** modelo isolado; pode ter `expires_at`, `version`, `active`; permite exclusão/anonimização granular; `ON DELETE CASCADE` com `conversations`; pode ser service-role-only.
- **Desvantagens:** exige migration futura; índice extra.
- **Conclusão:** opção preferida.

### 5. Armazenamento criptografado

- **Vantagens:** protege `salary` e datas mesmo em caso de acesso ao banco.
- **Desvantagens:** exige chave de criptografia, rotação, gestão de IV, não permite busca/índice nos campos criptografados.
- **Conclusão:** recomendado como camada adicional sobre a opção 4, não como única solução.

### 6. Reenvio do estado pelo chamador (WhatsApp)

- **Vantagens:** zero persistência.
- **Desvantagens:** limita mensagens a ~4096 chars; expõe PII na API do WhatsApp; perde-se entre mensagens quando o usuário não responde.
- **Conclusão:** inviável.

## Recomendação final

**Adotar a opção 4 (tabela específica com TTL) com criptografia obrigatória do `collected` (opção 5) desde a primeira implementação.**

A migration e a biblioteca `lib/laborSettlementState.js` foram projetadas para cifrar `collected` via `lib/encryption.js` antes de persistir. Se a chave de criptografia não estiver configurada, a biblioteca bloqueia o salvamento e não persiste o payload em claro.

Motivos:
- Isola o estado do cálculo do funil principal.
- TTL nativo (`expires_at`) permite expiração automática sem job externo complexo.
- Criptografia impede leitura dos dados sensíveis mesmo que o service_role acesse a tabela.
- Facilita exclusão manual, anonimização e auditoria.

## Modelo de dados implementado

Migration: `supabase/migrations/059_add_conversation_labor_states.sql`

Tabela: `conversation_labor_states`

```sql
CREATE TABLE IF NOT EXISTS conversation_labor_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT false,
  intent VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'idle',
  asked_fields TEXT[] NOT NULL DEFAULT '{}',
  protected_payload TEXT NOT NULL,
  last_message_hash VARCHAR(64),
  flow_version VARCHAR(20) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_labor_states_conversation_id
  ON conversation_labor_states(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_labor_states_expires_at
  ON conversation_labor_states(expires_at);
```

Campos:
- `protected_payload` armazena `collected` cifrado (AES-256-GCM) pela aplicação.
- `last_message_hash` é um hash da última mensagem processada; nunca o texto original.
- `expires_at` definido para 24 horas a partir de `now()`.
- `flow_version` invalida estados antigos quando o orquestrador muda.
- `conversation_id` é `UNIQUE` e `ON DELETE CASCADE` com `conversations`.

## Fluxo de leitura/escrita/expiração

### Inicialização

1. Webhook recebe `message` + `wa_message_id`.
2. Busca `conversation` por telefone.
3. Busca `conversation_labor_states` ativo para a `conversation_id`.
4. Se `expires_at < now()`, trata como `state = {}` (expirado) e apaga o registro antigo.

### Execução

1. Chama `adaptLaborSettlement({ message, state: loadedState })`.
2. Se `handled === true`:
   - upsert `conversation_labor_states` com `state`, `intent`, `active`, `expires_at`.
   - não salva `message` original, apenas `last_message_hash`.
3. Envia `response.text` ao WhatsApp.
4. Se `handled === false`:
   - se existir registro ativo e for out-of-domain, não altera o estado.

### Cancelamento

1. `state.status === 'cancelled'` indica limpeza.
2. Backend pode fazer `DELETE FROM conversation_labor_states WHERE conversation_id = $1`.
3. Auditoria: `log_audit(NULL, 'conversation_labor_states', conversation_id, 'delete_by_cancellation', NULL, NULL, jsonb_build_object('reason', 'user_cancelled'))`.

### Expiração

1. A cada `n` minutos (cron/edge function): `DELETE FROM conversation_labor_states WHERE expires_at < now()`.
2. Não gerar backup dos dados expirados.
3. Incluir nos relatórios de retenção (`data_retention_policy` com `entity_type = 'labor_state'`).

### Exclusão junto com conversa

- `ON DELETE CASCADE` garante que a exclusão da conversa apaga o estado.
- Também deve haver função `anonymize_conversation` que apaga `collected` ao anonimizar a conversa.

## Autorização e RLS

### Políticas recomendadas

```sql
ALTER TABLE conversation_labor_states ENABLE ROW LEVEL SECURITY;

-- Apenas service_role (backend) acessa diretamente.
-- service_role bypassa RLS por padrão; por isso toda leitura/escrita DEVE passar por
-- lib/laborSettlementState.js e validar o authorizationContext explicitamente.
CREATE POLICY conversation_labor_states_service_role_only
  ON conversation_labor_states
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Negar explicitamente anon e authenticated
CREATE POLICY conversation_labor_states_no_anon
  ON conversation_labor_states
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY conversation_labor_states_no_authenticated
  ON conversation_labor_states
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Proteção formal do payload (formato AES-256-GCM deste projeto)
ALTER TABLE conversation_labor_states
  ADD CONSTRAINT protected_payload_ciphertext_check
  CHECK (protected_payload ~ '^[0-9a-fA-F]{32}:[0-9a-fA-F]{32}:[0-9a-fA-F]+$');
```

### Controle no backend

- `lib/laborSettlementState.js` é a única camada de acesso; nunca acessar `conversation_labor_states` diretamente.
- O endpoint/webhook deve buscar o `conversation_id` pelo `phone`, garantindo que o estado pertence a essa conversa.
- Nunca expor `conversation_labor_states` diretamente via API pública.
- Verificar `conversation.assigned_user_id` se o fluxo for acessado por painel interno (escrita/leitura por advogado/admin).

## Concorrência e idempotência

- `wa_message_id` é único; o webhook já verifica duplicatas em `messages`.
- `last_message_hash` evita reprocessamento.
- `saveLaborSettlementState` exige `expectedUpdatedAt` para updates; `UPDATE ... WHERE updated_at = $1` é atômico.
- Se duas requisições simultâneas atualizarem o mesmo `conversation_id`, a condição em `updated_at` faz com que uma delas retorne `CONCURRENCY_CONFLICT`.
- O orquestrador é determinístico, então uma nova tentativa a partir de um recarregamento produz resultado consistente.

## Criptografia

Implementada em `lib/laborSettlementState.js` via `lib/encryption.js` (AES-256-GCM):

- O campo `collected` é serializado em JSON e cifrado antes de persistir.
- O ciphertext é armazenado em `protected_payload` (TEXT).
- A chave é `LABOR_STATE_ENCRYPTION_KEY`, **não** `CALENDAR_ENCRYPTION_KEY`.
- `lib/encryption.js` foi parametrizado para aceitar o nome da variável de ambiente; `encrypt`/`decrypt` default continuam em `CALENDAR_ENCRYPTION_KEY`, preservando calendário.
- `active`, `intent`, `status`, `asked_fields`, `last_message_hash`, `expires_at` e `flow_version` permanecem em colunas normais para indexação e TTL.
- Se `LABOR_STATE_ENCRYPTION_KEY` não estiver configurada, `saveLaborSettlementState` lança `LaborStateError('ENCRYPTION_FAILED')` e **não persiste em claro**.
- A chave nunca é logada, commitada ou retornada ao cliente.

## Biblioteca `lib/laborSettlementState.js`

Funções exportadas:
- `loadLaborSettlementState({ conversationId, authorizationContext, now })`
- `saveLaborSettlementState({ conversationId, state, authorizationContext, expectedUpdatedAt, now })`
- `deleteLaborSettlementState({ conversationId, authorizationContext })`
- `expireLaborSettlementState({ conversationId, authorizationContext, now })`
- `isLaborSettlementStateExpired(state, now)`

### authorizationContext

Obrigatório. Aceita uma das formas:
- `{ userId, allowedConversationId }`
- `{ userId, allowedConversationIds: [...] }`
- `{ userId, canAccessConversation: (id) => boolean }` — **deve ser síncrona e retornar exatamente `true`.**

Não basta passar `conversationId`; a aplicação deve provar o escopo.

### Regras da biblioteca

- Valida UUID de `conversationId`.
- Não carrega estado expirado ou com `flow_version` incompatível; apaga esses registros.
- `save` inspeciona o registro existente: se expirado, apaga e rejeita com `STATE_EXPIRED`; se `flow_version` incompatível, apaga e rejeita com `FLOW_VERSION_INVALID`.
- `save` exige `expectedUpdatedAt` quando o registro já existe; `UPDATE ... WHERE updated_at = $1` evita sobrescrita silenciosa.
- `save` direto nunca ressuscita um registro expirado.
- `last_message_hash` repetido torna `save` idempotente.
- Não loga `collected`, mensagem ou resposta.
- Não expõe stack traces; erros são `LaborStateError` com códios determinísticos.

## Auditoria

Não há auditoria automática por mensagem/ler nesta etapa. A camada de integração futura poderá registrar eventos sanitizados:
- `labor_state_created`
- `labor_state_updated`
- `labor_state_expired`
- `labor_state_deleted`

Esses eventos não devem conter `payload`, mensagem, salário, datas, prompts, respostas ou resultados completos. Permitido:
- `action`;
- `conversation_id` se necessário;
- `expires_at`, `flow_version`.

Nunca registrar o conteúdo de `collected` em logs.

## Retenção

| Política | Valor |
|---|---|
| `entity_type` | `labor_state` |
| `retention_days` | `1` (até 7 dias, ajustável) |
| `action_on_expiry` | `delete` |

Justificativa: o cálculo é uma simulação temporária; o cliente pode repetir a qualquer momento. Não há razão para guardar dados salariais/vínculo por mais de 24-48h.

## Rollback e versionamento

- `flow_version` permite descartar estados antigos quando o orquestrador muda.
- Implementar `clearOutdatedLaborStates(version)` para apagar registros cuja `flow_version < min_allowed_version`.
- Não migrar conteúdo JSON de versões antigas; apenas apagar.

## Plano de integração futura

### Etapa 1 — Aplicar migration
- Executar `supabase/migrations/059_add_conversation_labor_states.sql` no ambiente autorizado.
- Verificar RLS e políticas.

### Etapa 2 — Configurar chave de criptografia
- Definir `LABOR_STATE_ENCRYPTION_KEY` no gerenciamento de segredos.
- Formato: 64 caracteres hexadecimais / 32 bytes para AES-256-GCM.
- Nunca usar `CALENDAR_ENCRYPTION_KEY` como fallback.
- Sem chave, `saveLaborSettlementState` bloqueia com `ENCRYPTION_FAILED`.

### Etapa 3 — Integrar no webhook
- Em `pages/api/webhook.js`, após `getOrCreateConversation`:
  - construir `authorizationContext` com `allowedConversationId`;
  - `loadLaborSettlementState`;
  - `adaptLaborSettlement({ message, state: loadedState })`;
  - `saveLaborSettlementState` com `lastMessageHash` se `handled === true`;
  - enviar `response.text`;
- Continuar permitindo mensagens `other` no fluxo normal de IA.

### Etapa 4 — Limpeza expirada
- Criar endpoint/edge function `DELETE FROM conversation_labor_states WHERE expires_at < now()`.
- Não fazer sem autorização.

## Riscos

| Risco | Mitigação |
|---|---|
| PII vazado em logs | Nunca logar `collected`; usar hashes |
| RLS mal configurado | Política `service_role_only`; nunca usar anon/public |
| Expiração não ocorrer | Índice em `expires_at` + worker/cron |
| Concorrência quebra coleta | Re-carregar `state` antes de salvar; usar `updated_at` como versão |
| Estado antigo incompatível | `flow_version` e limpeza obrigatória |
| `collected` lido pelo service_role | Cifrar `collected`; RLS limita ao service_role; validar escopo na aplicação |
| Chave de criptografia vazada | Guardar `LABOR_STATE_ENCRYPTION_KEY` em secret/Vercel; nunca commitar; sem fallback; bloqueia se ausente |

## Limitações do presente trabalho

- A migration `059` continua **não aplicada** em banco real.
- Nenhum endpoint, UI, WhatsApp, Gemini, webhook, `lib/ai.js` ou `lib/aiRag.js` foi alterado.
- Nenhuma variável de ambiente foi criada na Vercel ou em qualquer ambiente.
- A integração ativa requer aprovação humana e configuração de `LABOR_STATE_ENCRYPTION_KEY`.
