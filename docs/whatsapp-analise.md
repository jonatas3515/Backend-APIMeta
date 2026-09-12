# Análise e Plano: Integração WhatsApp, Templates e Rastreio no Funil

> **Nota:** este documento é uma análise e proposta. Nenhum SQL, migration, RLS ou schema será executado/alterado via repositório. A implementação efetiva deve ser planejada em etapas e validada em staging.

## 1. Levantamento do estado atual

### 1.1 Integração WhatsApp existente

O sistema já possui integração ativa com a **WhatsApp Cloud API da Meta** (anteriormente via API do WhatsApp Business). Os principais artefatos são:

| Arquivo / Componente | Função |
|----------------------|--------|
| `lib/whatsapp.js` | Funções `sendWhatsAppMessage`, `uploadMediaToWhatsApp`, `sendWhatsAppMediaMessage` usando a Graph API `v20.0` |
| `pages/api/webhook.js` | Recebe webhooks de mensagens e status de entrega da Meta; executa o bot Gemini; salva mensagens em `messages` |
| `pages/api/send-message.js` | Endpoint para envio manual de mensagens pelo painel |
| `pages/api/customer-profile.js` | Envia solicitação de consentimento LGPD por WhatsApp |
| `pages/api/document-checklist-requests.js` | Envia solicitação de documentos por WhatsApp |
| `pages/api/reminders.js` e `pages/api/cron/reminders.js` | Envio de lembretes por WhatsApp |
| `pages/api/process-media.js` | Processa mídia e responde por WhatsApp |
| `lib/webhookLog.js` | Logger sanitizado do webhook |

#### Variáveis de ambiente utilizadas

- `WHATSAPP_TOKEN` — token de acesso à Cloud API.
- `WHATSAPP_PHONE_NUMBER_ID` — ID do número de telefone.
- `WEBHOOK_VERIFY_TOKEN` — token de verificação do webhook.
- `ADMIN_WHATSAPP_NUMBER` — número do administrador para notificações.

### 1.2 Armazenamento de mensagens

Mensagens são armazenadas na tabela `messages`:

- `conversation_id` (FK com `ON DELETE CASCADE`).
- `direction` (`inbound` / `outbound`).
- `sender_type` (`client` / `bot` / `human` / `ai`).
- `text`.
- `media_url` (Supabase Storage `chat-files`).
- `wa_message_id`.
- `status` (`sent`, `delivered`, `read`, etc.).
- `is_sensitive`, `sensitive_reason`.

### 1.3 Status de entrega

O `webhook.js` já chama `processDeliveryStatuses(statuses)` quando a Meta envia `statuses` (`sent`, `delivered`, `read`, `failed`). A tabela `messages` possui a coluna `status` e é atualizada com `wa_message_id` no envio, mas a implementação completa do processamento de `statuses` deve ser revisada para confirmar a atualização automática.

### 1.4 Funil existente

A tabela `conversations` possui `funnel_stage` com valores padronizados na migration `022_enhance_funnel_pipeline.sql`:

1. `lead_novo`
2. `intake_em_andamento`
3. `intake_concluido`
4. `proposta_enviada`
5. `contrato_assinado`
6. `acao_protocolada`
7. `aguardando_decisao`
8. `encerrado`

Outros campos de rastreamento:

- `funnel_stage_updated_at`
- `intake_started_at`
- `intake_completed_at`
- `proposal_sent_at`
- `contract_signed_at`
- `action_filed_at`
- `case_closed_at`
- `has_case`
- `human_assigned_at`

A tabela `funnel_history` registra todas as transições de estágio com `from_stage`, `to_stage`, `changed_by`, `reason` e `created_at`.

Há também views `funnel_metrics` e `funnel_conversion_rates`, além do endpoint `pages/api/funnel.js` para consulta de estágios, histórico e métricas.

### 1.5 Templates existentes

O sistema possui `document_templates` (propostas, contratos, etc.) e `document_checklist_requests` usa `message_template_key` para enviar mensagens de documentação. No entanto, **não existe um cadastro formal de templates de mensagem do WhatsApp** (com nome, variáveis, aprovação e status de envio).

### 1.6 Lacunas identificadas

| Área | Lacuna |
|------|--------|
| Templates WhatsApp | Não há gerenciamento de templates aprovados pela Meta com placeholders e idioma |
| Rastreio de status | Envios registram `wa_message_id` e `status='sent'`, mas `delivered`/`read` precisam ser confirmados no processamento do webhook |
| Funil + WhatsApp | Mensagens não disparam mudanças automáticas de `funnel_stage` (exceto intake) |
| Métricas de conversação | Não há cálculo de tempo de resposta, taxa de resposta, taxa de leitura por etapa do funil |
| Mídia outbound | Envio de mídia do painel para o cliente é possível via `sendWhatsAppMediaMessage`, mas não há interface unificada |

## 2. Requisitos funcionais propostos

### 2.1 Envio e recebimento de mensagens

#### 2.1.1 Recebimento (já implementado, mas melhorias)

- Garantir atualização de `messages.status` para `delivered` e `read` ao receber webhooks de status.
- Adicionar `message_status_history` (ou aproveitar `messages` + `status` atual) para histórico completo de entrega.
- Classificar mensagens recebidas automaticamente como `is_sensitive` se conterem padrões de CPF, CNPJ, número de cartão, etc. (regex no `webhook.js` ou função Supabase).
- Incrementar métricas `conversations:receive` e `messages:receive`.

#### 2.1.2 Envio

- Endpoint `POST /api/send-message` já existe; fortalecer com:
  - Envio de mídia (imagem, áudio, vídeo, documento) usando `sendWhatsAppMediaMessage`.
  - Escolha entre mensagem normal e template (fora da janela de 24h).
  - Registro de `wa_message_id`, `status='sent'`, `sender_type='human'` ou `'ai'`.
  - Auditoria em `audit_logs`.

#### 2.1.3 Vinculação

Toda mensagem outbound deve ser vinculada a:

- `conversation_id`
- `case_id` (quando houver)
- `user_id` (quem enviou do painel)
- `wa_message_id` (para rastreamento)

### 2.2 Templates de WhatsApp

#### 2.2.1 Cadastro de templates

Nova tabela/estrutura `message_templates` (a definir em migration futura):

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | uuid | PK |
| `name` | varchar(100) | Nome interno |
| `wa_template_name` | varchar(100) | Nome aprovado na Meta |
| `language` | varchar(10) | `pt_BR`, `pt` |
| `category` | varchar(50) | `MARKETING`, `UTILITY`, `AUTHENTICATION` |
| `body` | text | Texto com placeholders `{{1}}`, `{{2}}` etc. |
| `header_type` | varchar(20) | `NONE`, `TEXT`, `IMAGE`, `VIDEO`, `DOCUMENT` |
| `header_text` | text | Texto do cabeçalho (se houver) |
| `footer` | text | Rodapé |
| `variables` | jsonb | Descrição e exemplo de cada variável |
| `status` | varchar(20) | `pending`, `approved`, `rejected`, `paused` |
| `legal_basis` | varchar(50) | Para quem e quando pode ser usado |
| `created_at` | timestamptz | - |

#### 2.2.2 Uso de templates

- Endpoint `POST /api/whatsapp/templates/{id}/send`:
  - Recebe `conversation_id`, `variables` (array de valores), `case_id` opcional.
  - Valida se template está `approved`.
  - Monta payload da Cloud API com `type: 'template'` e `template.name` / `template.language`.
  - Envia e registra em `messages` com `content_type='template'`.
  - Registra `audit_logs`.

#### 2.2.3 Interface no painel

- Tela "Templates de WhatsApp" (admin):
  - Listar templates (`pending`, `approved`, `rejected`).
  - Criar rascunho com visualização de placeholders.
  - Enviar teste para número específico.
- Modal no chat:
  - Selecionar template aprovado.
  - Preencher variáveis.
  - Pré-visualizar mensagem.
  - Enviar.

### 2.3 Rastreio de interações no funil

#### 2.3.1 Eventos de WhatsApp como eventos de funil

Criar `funnel_events` (ou reutilizar `funnel_history`) para registrar ações relevantes:

| Evento | Quando | Ação esperada |
|--------|--------|---------------|
| `first_contact` | Primeira mensagem de um novo lead | Criar conversa em `lead_novo` |
| `intake_started` | Cliente responde primeira pergunta do intake | `funnel_stage = 'intake_em_andamento'` |
| `intake_completed` | Última pergunta respondida | `funnel_stage = 'intake_concluido'` |
| `proposal_sent` | Advogado envia proposta (documento gerado ou mensagem) | `funnel_stage = 'proposta_enviada'`, `proposal_sent_at` |
| `proposal_accepted` | Cliente responde confirmação de proposta | Avançar para `contrato_assinado` |
| `contract_signed` | Assinatura concluída | `funnel_stage = 'contrato_assinado'`, `contract_signed_at` |
| `human_takeover` | Atendente muda `mode` para `human` | `human_assigned_at` |
| `case_opened` | Caso jurídico criado | `has_case = true` |
| `reminder_sent` | Envio de lembrete | Registrar em `funnel_events` |

#### 2.3.2 Métricas propostas

| Métrica | Cálculo | Utilidade |
|---------|---------|-----------|
| Tempo médio de resposta | Diferença entre `inbound` e próximo `outbound` (bot ou humano) | SLA de atendimento |
| Tempo em cada estágio | `funnel_stage_updated_at` - timestamps de entrada | Identificar gargalos |
| Taxa de conversão | `# entrou no estágio / # saiu para o próximo` | Eficiência do funil |
| Taxa de resposta do cliente | `% de mensagens outbound que geram resposta inbound` | Engajamento |
| Taxa de leitura | `read / delivered` | Eficácia de comunicação |
| Volume de mensagens por canal | `messages` por dia/semana/mês | Capacidade operacional |
| Mensagens por fase | Contagem por `funnel_stage` | Distribuição de leads |

#### 2.3.3 Automações simples

- Quando cliente responde a uma proposta com palavras de aceite (`sim`, `aceito`, `concordo`), avançar `funnel_stage` para `contrato_assinado` (com confirmação futura de assinatura).
- Quando advogado gera e envia proposta, setar `funnel_stage = 'proposta_enviada'` automaticamente.
- Quando documento é assinado no Zapsign (webhook `signatures/webhook`), setar `funnel_stage = 'contrato_assinado'`.

## 3. Impactos técnicos e riscos

### 3.1 Backend

| Impacto | Descrição | Nível |
|---------|-----------|-------|
| Novas tabelas | `message_templates`, `funnel_events` (opcional) | Médio |
| Alteração em `webhook.js` | Processar `statuses`, registrar `funnel_events`, classificar sensibilidade | Médio |
| Novo endpoint de templates | `POST /api/whatsapp/templates/:id/send` | Médio |
| Alteração em `send-message.js` | Suporte a mídia e templates | Médio |
| Cache | Invalidar listagens de conversas/mensagens após envio | Baixo |
| Auditoria | Registrar envio, recebimento, mudança de funil em `audit_logs` | Baixo |
| Métricas | Adicionar `whatsapp:send`, `whatsapp:receive`, `funnel:stage_change` | Baixo |

### 3.2 Frontend

| Tela / Componente | Descrição | Nível |
|-------------------|-----------|-------|
| Templates de WhatsApp | CRUD e gerenciamento de templates (admin) | Médio |
| ChatWindow | Botão "Usar template" com modal de seleção | Médio |
| FunnelKanban | Exibir eventos de WhatsApp e métricas | Médio |
| MetricsPanel / Funnel | Dashboard de tempo de resposta, taxa de leitura, conversão | Médio |

### 3.3 Riscos

| Risco | Causa | Mitigação |
|-------|-------|-----------|
| Bloqueio do número por spam | Envio massivo de mensagens fora do contexto | Usar templates aprovados, respeitar janela de 24h, registrar consentimento |
| Custos da Cloud API | Cobrança por conversação | Definir limites diários, fila de envio, rate limit |
| Exposição de PII em logs | `webhook.js` imprime body, headers, telefone | Reforçar sanitização no `lib/webhookLog.js` e `lib/safeLogger.js` |
| Rejeição de templates | Meta reprova templates de marketing | Usar categoria `UTILITY` quando possível; respeitar políticas de conteúdo |
| LGPD / consentimento | Envio de mensagens sem consentimento | Validar `consent_logs` antes de marketing; manter opt-in registrado |
| Latência no webhook | Meta exige resposta < 20s | Responder `200` imediatamente e processar em segundo plano |
| Mídia não processada | Arquivos grandes ou formatos inválidos | Limitar tamanho, converter áudio, validar MIME type |

## 4. Plano de implementação proposto

### Fase 1 — Consolidação do rastreio (1 sprint)

1. **Corrigir e homologar status de entrega**
   - Verificar `processDeliveryStatuses` em `webhook.js`.
   - Garantir atualização de `messages.status` para `delivered` e `read`.
   - Adicionar testes sintéticos para `sent` / `delivered` / `read`.

2. **Métricas de WhatsApp**
   - Adicionar `lib/metrics.js`: `whatsapp:send`, `whatsapp:receive`, `whatsapp:delivered`, `whatsapp:read`, `funnel:stage_change`.
   - Criar endpoint `GET /api/metrics/whatsapp` (admin) ou estender `/api/metrics`.

3. **Sanitização de PII no webhook**
   - Revisar `lib/webhookLog.js` e `webhook.js` para não logar telefone, nome, texto, headers ou body brutos.

### Fase 2 — Templates de WhatsApp (1-2 sprints)

1. **Criar tabela `message_templates`**
   - Nome, template aprovado na Meta, idioma, categoria, corpo, placeholders, status.

2. **Endpoint de envio de template**
   - `POST /api/whatsapp/templates/:id/send`.
   - Validar aprovação e preencher variáveis.
   - Registrar em `messages` e `audit_logs`.

3. **Interface no painel**
   - Tela de admin para cadastrar/gerenciar templates.
   - Modal no chat para selecionar e preencher variáveis.

### Fase 3 — Funil e automações (1-2 sprints)

1. **Criar tabela `funnel_events`**
   - `conversation_id`, `event_type`, `from_stage`, `to_stage`, `source` (`whatsapp`, `panel`, `signature`, `system`), `created_at`.

2. **Automações de estágio**
   - Avançar `funnel_stage` com base em eventos (proposta enviada, contrato assinado, etc.).
   - Integrar webhook de assinaturas (`signatures/webhook`) com mudança de funil.

3. **Métricas de funil**
   - Tempo por estágio, tempo de resposta, taxa de conversão, taxa de leitura.
   - Adicionar aba "Métricas de WhatsApp/Funil" no painel.

### Fase 4 — Mídia e envio avançado (1 sprint)

1. **Envio de mídia outbound**
   - Permitir upload de imagem, áudio, vídeo, documento no `ChatWindow`.
   - Usar `uploadMediaToWhatsApp` e `sendWhatsAppMediaMessage`.

2. **Fila e rate limit**
   - Implementar fila simples (Supabase `pgmq`, Redis ou memória) para envios.
   - Respeitar limites da Meta (conversações por segundo).

## 5. Considerações sobre schema e RLS

> Sem executar SQL, as alterações futuras sugeridas são:

1. **Tabela `message_templates`**
   - Criar em migration futura.
   - RLS: `admin` pode gerenciar; `authenticated` pode apenas listar templates aprovados.

2. **Tabela `funnel_events`**
   - Criar em migration futura.
   - RLS: `admin` e `advogado` podem SELECT; `service_role` pode INSERT.

3. **Colunas em `messages`**
   - Considerar `status_updated_at` para métricas de tempo de leitura.
   - `template_name` para rastrear qual template foi usado.

4. **Colunas em `conversations`**
   - Manter `funnel_stage`, timestamps e `has_case`.
   - Adicionar `last_inbound_at`, `last_outbound_at`, `avg_response_time` (computado) para métricas.

## 6. Evidências

- `npm run build` executado com sucesso (apenas warnings pré-existentes de hooks e `<img>`).
- Nenhum arquivo do repositório foi modificado para esta análise; apenas o documento `docs/whatsapp-analise.md` foi criado.

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
