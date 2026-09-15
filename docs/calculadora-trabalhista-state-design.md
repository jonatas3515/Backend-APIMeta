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

**Adotar a opção 4 (tabela específica com TTL) com criptografia opcional da coluna `collected` (opção 5) em uma fase posterior, se for exigido reforço de LGPD.**

Motivos:
- Isola o estado do cálculo do funil principal.
- TTL nativo (`expires_at`) permite expiração automática sem job externo complexo (basta `WHERE expires_at < now()` em worker/evento agendado).
- Facilita exclusão manual, anonimização e auditoria.
- Consome a mesma arquitetura Supabase/Vercel sem invenção de novo sistema.

## Modelo de dados proposto

Tabela: `conversation_labor_states`

```sql
CREATE TABLE IF NOT EXISTS conversation_labor_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  flow_version INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT false,
  intent VARCHAR(50),
  collected JSONB NOT NULL DEFAULT '{}',
  asked_fields TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'idle',
  last_message_hash VARCHAR(64),          -- hash da última mensagem processada (idempotência)
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labor_states_conversation
  ON conversation_labor_states(conversation_id);
CREATE INDEX IF NOT EXISTS idx_labor_states_expires_at
  ON conversation_labor_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_labor_states_active
  ON conversation_labor_states(conversation_id, active)
  WHERE active = true;
```

Campos:
- `collected` deve conter apenas os valores normalizados; não armazenar o texto original da mensagem.
- `last_message_hash` deve ser `sha256(wa_message_id)` ou `sha256(texto truncado)` para evitar reprocessamento de duplicatas do WhatsApp.
- `expires_at` definido como `now() + interval '24 hours'` por padrão.
- `flow_version` permite invalidar estados antigos quando o parser/orquestrador mudar.

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

-- Apenas service_role (backend) acessa diretamente
CREATE POLICY service_role_only_labor_states
  ON conversation_labor_states
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

### Controle no backend

- O endpoint/webhook deve buscar o `conversation_id` pelo `phone`, garantindo que o estado pertence a essa conversa.
- Nunca expor `conversation_labor_states` diretamente via API pública.
- Verificar `conversation.assigned_user_id` se o fluxo for acessado por painel interno (escrita/leitura por advogado/admin).

## Concorrência e idempotência

- `wa_message_id` é único; o webhook já verifica duplicatas em `messages`.
- `last_message_hash` evita que o mesmo estado seja reprocessado.
- Para mensagens muito próximas, usar `UPDATE ... WHERE updated_at < now() - interval '1 second'` ou lock otimista pelo `updated_at`.
- Se duas requisições simultâneas atualizarem o mesmo `conversation_id`, o Supabase serializa; a última `UPDATE` ganha. O orquestrador é determinístico, então o resultado final será consistente se o `state` for carregado novamente.

## Criptografia (fase 2)

Se for exigido:

- Criar `LABOR_STATE_ENCRYPTION_KEY` no gerenciamento de segredos (não no `.env` do repositório).
- Antes de salvar, criptografar `collected` com AES-256-GCM (`crypto` do Node.js).
- Armazenar `collected` como `TEXT`/`BYTEA` (ciphertext + IV + tag).
- O `state` em si (active, status, askedFields) pode permanecer descriptografado para indexação/limpeza.
- A chave nunca é logada, commitada ou retornada ao cliente.

## Auditoria

Nunca registrar o conteúdo de `collected` em logs. Permitido:
- `action: 'labor_state_created' | 'labor_state_updated' | 'labor_state_deleted'`
- `details: { conversation_id, expires_at, flow_version }` sem salário, datas ou nome.
- `audit_logs` recebe `entity_type = 'conversation_labor_states'`.

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

## Plano de implementação futura em etapas

### Etapa 1 — Migration
- Criar `supabase/migrations/059_add_conversation_labor_states.sql`.
- Criar políticas RLS, índices e trigger `update_updated_at`.

### Etapa 2 — Repository
- Criar `lib/laborSettlementState.js` com:
  - `loadLaborState(conversationId)`
  - `saveLaborState(conversationId, state, expiresInHours)`
  - `deleteLaborState(conversationId)`
  - `expireLaborStates()`
- Sem logs de PII.

### Etapa 3 — Integração no webhook
- Em `pages/api/webhook.js`, após `getOrCreateConversation`:
  - carregar `conversation_id`;
  - chamar `adaptLaborSettlement` com `state` carregado;
  - persistir `state` se `handled === true`;
  - enviar `response.text`;
- Continuar a permitir que mensagens `other` passem para o fluxo normal de IA.

### Etapa 4 — Criptografia (opcional)
- Adicionar criptografia de `collected` em `lib/laborSettlementState.js`.

### Etapa 5 — Testes
- Testar com estados sintéticos, sem dados reais.
- Verificar expiração, concorrência, exclusão em cascata e LGPD.

## Riscos

| Risco | Mitigação |
|---|---|
| PII vazado em logs | Nunca logar `collected`; usar hashes |
| RLS mal configurado | Política `service_role_only`; nunca usar anon/public |
| Expiração não ocorrer | Índice em `expires_at` + worker/cron |
| Concorrência quebra coleta | Re-carregar `state` antes de salvar; usar `updated_at` como versão |
| Estado antigo incompatível | `flow_version` e limpeza obrigatória |
| Chave de criptografia vazada | Guardar em variável de ambiente/secret, nunca commitar |

## Limitações do presente documento

- Nenhuma migration foi criada.
- Nenhum banco foi alterado.
- Nenhum endpoint, UI, WhatsApp ou Gemini foi conectado.
- A escolha final requer aprovação humana antes da implementação.
