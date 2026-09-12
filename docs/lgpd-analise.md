# Análise e Plano de Implementação: Direitos do Titular e Consentimento (LGPD)

> **Nota:** este documento é uma análise e proposta. Nenhum SQL será executado, nenhuma migration será criada/aplicada e nenhuma alteração de schema/RLS será feita via repositório. A implementação efetiva será planejada em etapas e executada fora deste escopo.

## 1. Levantamento do estado atual

### 1.1 Tabelas e dados pessoais no sistema

| Tabela | Dados pessoais identificados | Pode ser anonimizado? | Relacionamentos críticos |
|--------|------------------------------|----------------------|--------------------------|
| `conversations` | `client_phone`, `client_name`, `client_email`, `municipality`, `agency`, `client_role`, `intake_data` (nome, e-mail, telefone, CPF/CNPJ, endereço etc.) | Sim, com `anonymize_lead` | `messages`, `cases`, `consent_logs`, `anonymized_data`, `case_document_checklists`, `internal_notes` |
| `messages` | `text` (conteúdo de conversa), `media_url` | Sim (texto pode ser removido/anonymizado) | `conversation_id` FK com `ON DELETE CASCADE` |
| `cases` | `title`, `municipality`, `agency`, `client_role`, `notes` | Parcialmente (título e notas podem conter PII) | `conversation_id` FK com `ON DELETE CASCADE`; relaciona com `case_document_checklists`, `case_processes`, `case_insights` |
| `chat_clients` | `name`, `phone`, `notes` | Sim | Sincronizada com `conversations` via trigger |
| `case_document_checklists` | `document_name`, `media_url` (pode conter PII no documento) | Sim, se remover mídia | `case_id`, `conversation_id` |
| `client_info_requests` | `intake_data`, `requested_info` | Sim | `conversation_id` |
| `document_checklist_requests` | `document_name`, `client_message` | Sim | `case_id`, `conversation_id` |
| `generated_documents` | `content` (propostas/contratos com nome, CPF/CNPJ, endereço) | Sim, se remover arquivo | `case_id`, `conversation_id` |
| `fee_simulations` | `metadata` (dados do cliente) | Sim | `conversation_id` |
| `users` | `name`, `email`, `auth_user_id` | Anonimização desabilita login; exclusão requer desativação (`is_active=false`) | `audit_logs`, `internal_notes`, `conversations.assigned_user_id`, `cases` |
| `consent_logs` | `conversation_id`, `ip_address`, `user_agent` | Parcialmente (IP/agente não são pessoais estritos, mas são identificadores) | `conversation_id` |
| `anonymized_data` | `backup_hash` | Não contém PII direto | `conversation_id` original |

### 1.2 Estruturas LGPD já existentes (migrations)

A migration `025_add_lgpd_and_data_retention.sql` já criou:

- `data_retention_policy` — políticas de retenção por entidade e ação ao expirar (`anonymize` ou `delete`).
- `anonymized_data` — registro de anonimizações com hash de backup.
- `consent_logs` — registro de consentimentos (`conversation_id`, `consent_type`, `value`, `ip_address`, `user_agent`, `created_at`).
- `messages.is_sensitive` e `messages.sensitive_reason` — marcação manual de mensagens sensíveis.
- `conversations.confidential_reason`, `confidential_marked_by`, `confidential_marked_at` — marcação de confidencialidade.
- Função `anonymize_lead(p_conversation_id, p_reason)` — substitui `client_name` por "Cliente Anonimizado", zera `client_phone`, `municipality`, `agency`, `client_role`.
- View `expired_leads` — leads fora da política de retenção.

### 1.3 Endpoints LGPD existentes

`pages/api/lgpd.js` (acesso restrito a `admin`):

- `GET`:
  - `expired_leads` — lista leads expirados.
  - `retention_policies` — lista políticas de retenção.
  - `consent_history` — histórico de consentimentos de uma conversa.
  - `anonymized_records` — registros de anonimização.
- `POST`:
  - `mark_confidential` / `mark_sensitive_message`.
  - `anonymize_lead` — chama RPC `anonymize_lead` e grava `audit_logs`.
  - `log_consent` — insere em `consent_logs`.
- `PATCH`:
  - `unmark_confidential`.

`pages/api/customer-profile.js` (acesso `minRole: 'estagiario'`):

- `GET` — perfil do cliente, casos, documentos, consentimentos, mensagens não sensíveis; detecta `anonymized_data`.
- `POST action=request_consent` — envia mensagem de WhatsApp pedindo consentimento e armazena `consent_request_status` em `intake_data`.

`pages/api/webhook.js`:

- Processa resposta `1`/`2` do cliente e registra consentimento (`consent: true` e `consent_log` em `intake_data`); não chama `log_consent` diretamente, apenas atualiza `conversations.intake_data`.

### 1.4 Fluxos atuais e lacunas

| Direito / função | Existe hoje? | Como funciona | Lacuna |
|------------------|--------------|---------------|--------|
| Anonimização de lead | Sim (parcial) | Função `anonymize_lead` zera campos de `conversations`; registra em `anonymized_data` | Não remove mensagens, casos, documentos, consentimentos, fee_simulations. Não oferece interface no painel. |
| Exclusão de cliente | Não | Não há endpoint/funcionalidade | Não existe opção de apagamento completo. |
| Exportação de dados pessoais | Não | Não há endpoint/funcionalidade | Não atende direito de acesso/portabilidade. |
| Registro de consentimento | Sim (parcial) | `consent_logs` existe e `log_consent` funciona; webhook interpreta resposta do cliente | Falta finalidade explícita, base legal, termo versionado, revogação organizada. |
| Revogação de consentimento | Não | Não há endpoint dedicado | Cliente pode responder "2" no WhatsApp, mas o registro é inconsistente (`consent: false` no `intake_data`, sem entrada em `consent_logs`). |
| Confidencialidade e sensibilidade | Sim (parcial) | `mark_confidential`, `mark_sensitive_message` | Uso manual; não há automação de classificação. |
| Política de retenção | Sim (parcial) | Tabela `data_retention_policy` e view `expired_leads` | Não há rotina automática de aplicação. |

## 2. Requisitos funcionais propostos

### 2.1 Exclusão / anonimização de dados

#### 2.1.1 Direito ao apagamento

Implementar duas modalidades, acessíveis via painel (admin/advogado) e, futuramente, via solicitação do titular:

1. **Anonimização (padrão para leads/prospectos)**
   - Substituir `client_name` por `Cliente Anonimizado #<hash-curto>`.
   - Remover/mascarar `client_phone` (`****<últimos 4 dígitos>`), `client_email`, `municipality`, `agency`, `client_role`.
   - Anonimizar `intake_data` preservando apenas preferências e consentimentos (sem nome/telefone/e-mail/CPF).
   - Limpar mensagens: reter metadados (`direction`, `sender_type`, `content_type`, `created_at`) e definir `text = '[anonymized]'`; remover `media_url` se contiver PII.
   - Manter casos, documentos e rotinas com identificadores anonimizados; anonimizar títulos e notas que contenham nome do cliente.
   - Registrar em `anonymized_data` e `audit_logs`.

2. **Exclusão completa (apenas para casos encerrados e sem obrigação legal)**
   - Verificar regras de retenção (`data_retention_policy`) e status do caso.
   - Excluir `conversations`, `messages`, `cases`, `case_document_checklists`, `fee_simulations`, `client_info_requests`, `consent_logs` (cascata via FKs).
   - Remover arquivos do Supabase Storage (`media_url`, documentos gerados, assinaturas).
   - Gerar comprovante de exclusão sem PII (hash e timestamp) em `anonymized_data`.
   - Nunca excluir `users` ou `audit_logs` (legitimo interesse e obrigação legal).

#### 2.1.2 Regras de negócio

| Situação | Ação permitida | Quem pode |
|----------|----------------|-----------|
| Lead (não cliente) | Anonimização | admin, advogado |
| Cliente sem casos ativos | Anonimização | admin, advogado |
| Cliente com casos encerrados e prazo prescricional/retencional cumprido | Exclusão completa | admin |
| Cliente com casos ativos | Apenas anonimização parcial (sem identificadores diretos); exclusão bloqueada | admin, advogado |
| Casos com documentos fiscais, contratos ou processos em andamento | Nenhuma exclusão; anonimização limitada | admin |

### 2.2 Exportação de dados pessoais

#### 2.2.1 Formato e conteúdo

Endpoint `GET /api/lgpd/export` (admin/advogado) e botão no painel:

- **JSON estruturado** (padrão).
- **CSV resumido** (opção para planilhas).

Conteúdo por titular (`conversation_id`):

```json
{
  "exportedAt": "2026-09-13T...",
  "dataSubject": {
    "id": "<conversation_id>",
    "name": "...",
    "phone": "...",
    "email": "..."
  },
  "data": {
    "conversation": { ... },
    "messages": [ ... ],
    "cases": [ ... ],
    "documents": [ ... ],
    "fee_simulations": [ ... ],
    "consent_history": [ ... ],
    "audit_logs": [ ... ]
  }
}
```

#### 2.2.2 Restrições

- Não incluir senhas, tokens, `signed_url`s, `media_url`s diretos.
- Substituir `media_url` por referência segura (bucket/path) e expiração curta.
- Limitar a 1 exportação por minuto por conversa (throttle).
- Registrar `audit_logs` (`entity_type='conversation'`, `action='data_export'`).

### 2.3 Registro e gestão de consentimento

#### 2.3.1 Estrutura proposta para `consent_logs`

Manter a tabela existente, enriquecendo os dados por aplicação (sem alterar schema agora):

| Campo | Uso | Exemplo |
|-------|-----|---------|
| `conversation_id` | Titular | FK |
| `consent_type` | Finalidade | `data_processing`, `marketing`, `signature`, `retention` |
| `value` | Boolean | `true` = dado; `false` = revogado |
| `channel` | Canal da coleta | `whatsapp`, `email`, `panel`, `signature` |
| `term_version` | Versão do termo | `v1.2` |
| `purpose` | Descrição curta | `Atendimento e propostas jurídicas` |
| `legal_basis` | Base legal | `consentimento`, `contrato`, `obrigacao_legal`, `interesse_legitimo` |
| `ip_address` | IP do titular | Opcional |
| `user_agent` | Dispositivo | Opcional |
| `created_at` | Data/hora | ISO 8601 |

#### 2.3.2 Fluxo de revogação

- Botão "Revogar consentimento" no painel do cliente.
- Nova entrada em `consent_logs` com `value=false` e `consent_type` correspondente.
- Ação registrada em `audit_logs`.
- Sistema passa a respeitar a revogação nas comunicações de marketing.

#### 2.3.3 Consentimento por assinatura

- No `document_signatures` já existe `document_type='termo_consentimento'`.
- Integrar aprovação da assinatura com inserção em `consent_logs` para `consent_type='signature'`.

## 3. Impactos técnicos e riscos

### 3.1 Backend

| Impacto | Descrição | Nível |
|---------|-----------|-------|
| Novos endpoints | `POST /api/lgpd/delete`, `POST /api/lgpd/anonymize`, `GET /api/lgpd/export`, `POST /api/lgpd/revoke-consent` | Médio |
| Alteração de `anonymize_lead` | Ampliar para apagar mensagens, casos, documentos e fee_simulations | Alto |
| Exclusão em cascata | `conversations` já tem `ON DELETE CASCADE` para `messages` e `cases`; verificar outras FKs | Médio |
| Storage | Remover arquivos do Supabase Storage ao excluir | Médio |
| Auditoria | Incluir `anonymize`, `delete`, `export`, `revoke_consent` em `audit_logs` e métricas | Baixo |
| Cache | Invalidar cache de conversas, casos, notificações após exclusão/anonimização | Médio |
| RLS | Revisar políticas para permitir ações via `service_role` sem expor dados | Médio |

### 3.2 Frontend

| Tela / componente | Descrição | Nível |
|-------------------|-----------|-------|
| Painel LGPD no cliente | Aba "Privacidade" com: consentimentos, anonimizar, excluir, exportar | Médio |
| Modal de confirmação | Aviso de irreversibilidade, tipo de ação, base legal | Baixo |
| Lista de consentimentos | Badge de ativo/revogado, data, finalidade, base legal | Baixo |
| Download de export | Botão com geração assíncrona e notificação | Médio |

### 3.3 Riscos

| Risco | Causa | Mitigação |
|-------|-------|-----------|
| Exclusão de dados sob guarda legal | Caso ativo, processo em andamento, documento fiscal | Bloquear por status e tipo; exigir confirmação dupla |
| Quebra de relacionamentos | Conversa excluída antes de casos | Usar FK `ON DELETE CASCADE` ou ordem determinada no backend |
| Exposição de PII no export | `media_url`, mensagens com CPF | Sanitizar `media_url`; filtrar mensagens sensíveis |
| Perda de consentimentos | Exclusão em cascata | Manter `consent_logs` até fase final ou copiar para `anonymized_data` |
| Logs com PII | `audit_logs` pode receber nome/e-mail | Usar `log_audit` com `p_details` sanitizado; evitar `user_email` nos inserts |
| Falha na anonimização de mensagens | Grande volume de texto | Atualização em lote com `supabaseAdmin` e retry |
| Custo de processamento | Exportar histórico grande | Paginação e limites de janela (7/30/90 dias) |

## 4. Plano de implementação proposto

### Fase 1 — Fundação (1-2 sprints)

1. **Endpoint de exportação de dados** (`GET /api/lgpd/export`)
   - Ler `conversation`, `messages`, `cases`, `documents`, `fee_simulations`, `consent_logs`.
   - Sanitizar `media_url` e `signed_url`s.
   - Retornar JSON/CSV.
   - Registrar `audit_logs`.

2. **Registro de consentimento aprimorado**
   - Normalizar `consent_logs` para incluir `channel`, `term_version`, `purpose`, `legal_basis` (campos opcionais no `req.body`, sem alterar schema inicial).
   - Criar endpoint `POST /api/lgpd/revoke-consent`.
   - Atualizar `webhook.js` para chamar `log_consent` ao receber resposta `2`.

3. **Interface básica no painel**
   - Aba "Privacidade e Consentimentos" no perfil do cliente.
   - Exibir lista de consentimentos e botão "Exportar dados".
   - Documentar política de retenção.

### Fase 2 — Exclusão e anonimização (1-2 sprints)

1. **Anonimização completa**
   - Evoluir função `anonymize_lead` ou criar `anonymize_conversation` que:
     - limpa `conversations`;
     - anonimiza `messages.text`;
     - anonimiza títulos e notas de `cases`;
     - marca `case_document_checklists` e `generated_documents` para revisão/remoção;
     - registra em `anonymized_data` e `audit_logs`.
   - Endpoint `POST /api/lgpd/anonymize` com validações de permissão e bloqueios.

2. **Exclusão controlada**
   - Endpoint `POST /api/lgpd/delete`:
     - Verifica `data_retention_policy`;
     - Verifica status do caso;
     - Exclui storage;
     - Exclui dados em cascata;
     - Gera comprovante de exclusão.

3. **Cache e notificações**
   - Invalidar cache de conversa/caso após ação.
   - Atualizar contadores e notificações.

### Fase 3 — Gestão e automação (1 sprint)

1. **Rotina de retenção automática**
   - Job diário/horário que processa `expired_leads` aplicando `anonymize` ou `delete` conforme `data_retention_policy`.

2. **Consentimento por assinatura**
   - Integrar `document_signatures` webhook com `consent_logs` para `termo_consentimento`.

3. **Métricas e alertas**
   - Adicionar métricas `lgpd:export`, `lgpd:anonymize`, `lgpd:delete`, `lgpd:revoke`.
   - Incluir no guia de monitoramento pós-deploy.

4. **Treinamento e documentação**
   - Atualizar `docs/monitoramento-pos-deploy.md`.
   - Criar roteiro para o time jurídico/administrativo.

## 5. Considerações sobre schema e RLS

> Sem executar SQL nem criar migrations, recomenda-se apenas as seguinte alterações futuras, a serem avaliadas em ambiente de staging:

1. Adicionar colunas a `consent_logs` (se fizer sentido):
   - `channel VARCHAR(50)`
   - `term_version VARCHAR(20)`
   - `purpose TEXT`
   - `legal_basis VARCHAR(50)`
   - `revoked_at TIMESTAMPTZ` (redundante, mas facilita consultas)

2. Criar tabela `data_export_requests` (opcional):
   - `id`, `conversation_id`, `requested_by`, `status` (`pending`, `ready`, `downloaded`), `expires_at`, `created_at`.

3. Políticas de RLS:
   - `consent_logs`: `authenticated` pode inserir próprio consentimento (via `conversation_id` que pertence ao `client_phone`); `admin` pode tudo.
   - `anonymized_data`: `admin` pode SELECT.
   - `data_retention_policy`: somente `admin`.
   - Nunca expor `audit_logs` direto ao `authenticated`; manter `admin`/service_role.

## 6. Evidências

- `npm run build` executado com sucesso (apenas warnings pré-existentes de hooks e `<img>`).
- Nenhum arquivo do repositório foi modificado para fins desta análise; apenas o documento `docs/lgpd-analise.md` foi criado.

## 7. Restrições respeitadas

| Item | Status |
|------|--------|
| SQL executado via repositório | Não |
| Migration criada/aplicada via repositório | Não |
| RLS alterado via repositório | Não |
| Schema alterado via repositório | Não |
| Commit/push/deploy de SQL/migrations | Não |
| `git add .` / `git add -A` | Não |
| PII/credenciais expostas | Não |
| `scripts/apply-migration-056.js` tocado | Não |
