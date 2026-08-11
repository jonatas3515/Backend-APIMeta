# Guia de Colaboração, LGPD e Auditoria

## 📋 O que foi implementado

### 1. **Módulo de Colaboração e Handoff**

#### Tabela `users`
```sql
id, name, email, password_hash, role, is_active, created_at, updated_at
```
- **Roles:** admin, advogado, estagiario
- Permite gerenciar quem é responsável por cada atendimento

#### Campos em `conversations` e `cases`
- `assigned_user_id` - Usuário responsável pelo atendimento/caso
- Permite rastrear quem cuida de cada conversa

#### Campo em `messages`
- `human_user_id` - Qual usuário humano respondeu a mensagem
- Registra "respondido por [nome]" em cada mensagem humana

#### Tabela `internal_notes`
```sql
id, conversation_id, case_id, user_id, text, is_visible_to_client, created_at, updated_at
```
- Notas internas (não visíveis ao cliente) ou compartilhadas
- Histórico de quem escreveu o quê e quando
- Separação clara entre "visible to client" e "internal only"

---

### 2. **Camada de Segurança e LGPD**

#### Campos em `conversations`
- `is_client` - Boolean: true se virou cliente, false se é lead
- `lead_created_at` - Data de criação do lead
- `lead_last_contact_at` - Data do último contato
- `confidential_reason` - Motivo da marcação confidencial
- `confidential_marked_by` - Quem marcou como confidencial
- `confidential_marked_at` - Quando foi marcado

#### Campos em `messages`
- `is_sensitive` - Boolean: true se contém dados sensíveis
- `sensitive_reason` - Motivo (ex: dados bancários, SSN)

#### Tabela `data_retention_policy`
```sql
id, name, entity_type, retention_days, action_on_expiry (anonymize|delete), is_active
```
- Define políticas de retenção por tipo de entidade
- Exemplo: leads com 6 meses sem contato → anonimizar

#### Tabela `anonymized_data`
```sql
id, original_entity_type, original_entity_id, anonymized_at, reason, anonymized_by, backup_hash
```
- Registro de anonimizações (para auditoria)
- Hash dos dados originais (para verificação)

#### Tabela `consent_logs`
```sql
id, conversation_id, consent_type, value, ip_address, user_agent, created_at
```
- Registro de consentimentos (LGPD)
- Exemplo: marketing, data_processing

#### View `expired_leads`
```sql
SELECT leads que expiraram conforme política de retenção
```

---

### 3. **Trilha de Auditoria**

#### Tabela `audit_logs`
```sql
id, user_id, entity_type, entity_id, action, old_value, new_value, details, created_at
```
- Registra TODAS as operações críticas:
  - `update_status` - Status/funnel_stage mudou
  - `change_assigned_user` - Responsável mudou
  - `mark_confidential` - Marcado como confidencial
  - `anonymize_lead` - Lead foi anonimizado
  - Etc.

#### Função `log_audit()`
```sql
SELECT log_audit(user_id, entity_type, entity_id, action, old_value, new_value, details)
```
- Registra auditoria automaticamente via trigger

#### Triggers Automáticos
- `trigger_audit_conversation_changes` - Registra mudanças em conversations
- Automático quando status, assigned_user_id ou confidential mudam

---

## 🔌 APIs

### Colaboração

#### GET /api/collaboration?action=users
Lista usuários ativos:
```json
[
  { "id": "uuid", "name": "João Silva", "email": "joao@example.com", "role": "advogado" }
]
```

#### GET /api/collaboration?action=notes&conversation_id=<id>
Lista notas de uma conversa:
```json
[
  {
    "id": "uuid",
    "text": "Cliente está insatisfeito",
    "is_visible_to_client": false,
    "users": { "name": "Maria" },
    "created_at": "2024-08-11T14:30:00Z"
  }
]
```

#### GET /api/collaboration?action=audit&entity_type=conversation&entity_id=<id>
Histórico de auditoria:
```json
[
  {
    "id": "uuid",
    "action": "change_assigned_user",
    "old_value": "uuid-user-1",
    "new_value": "uuid-user-2",
    "users": { "name": "Admin" },
    "created_at": "2024-08-11T14:30:00Z"
  }
]
```

#### POST /api/collaboration
Adicionar nota:
```json
{
  "action": "add_note",
  "conversation_id": "uuid",
  "text": "Nota interna",
  "is_visible_to_client": false,
  "user_id": "uuid"
}
```

Atribuir usuário:
```json
{
  "action": "assign_user",
  "entity_type": "conversation",
  "entity_id": "uuid",
  "user_id": "uuid",
  "current_user_id": "uuid"
}
```

---

### LGPD

#### GET /api/lgpd?action=expired_leads
Lista leads expirados:
```json
{
  "total": 5,
  "leads": [
    {
      "id": "uuid",
      "client_name": "João",
      "days_since_last_contact": 200,
      "retention_days": 180,
      "action_on_expiry": "anonymize"
    }
  ]
}
```

#### GET /api/lgpd?action=retention_policies
Lista políticas de retenção ativas

#### GET /api/lgpd?action=consent_history&conversation_id=<id>
Histórico de consentimentos

#### GET /api/lgpd?action=anonymized_records
Registros de anonimizações

#### POST /api/lgpd
Marcar como confidencial:
```json
{
  "action": "mark_confidential",
  "conversation_id": "uuid",
  "reason": "Assédio sexual",
  "user_id": "uuid"
}
```

Anonimizar lead:
```json
{
  "action": "anonymize_lead",
  "conversation_id": "uuid",
  "reason": "Expirou conforme política de retenção",
  "user_id": "uuid"
}
```

Marcar mensagem como sensível:
```json
{
  "action": "mark_sensitive_message",
  "message_id": "uuid",
  "reason": "Contém dados bancários",
  "user_id": "uuid"
}
```

Registrar consentimento:
```json
{
  "action": "log_consent",
  "conversation_id": "uuid",
  "consent_type": "marketing",
  "value": true,
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0..."
}
```

---

## 🎯 Fluxo de Uso

### Colaboração

1. **Criar usuários:** Painel → Usuários → + Novo Usuário
2. **Atribuir conversa:** Painel → Colaboração → Atribuir → Selecionar usuário
3. **Adicionar nota:** Painel → Notas → Escrever nota → Salvar
4. **Ver auditoria:** Painel → Auditoria → Ver histórico de mudanças

### LGPD

1. **Marcar confidencial:** Painel → Conversa → Marcar como Confidencial → Selecionar motivo
2. **Anonimizar lead:** Painel → Leads Expirados → Anonimizar
3. **Marcar mensagem sensível:** Painel → Mensagem → Marcar como Sensível
4. **Registrar consentimento:** Automático via webhook ou manual via API

---

## 🔐 Segurança

### Soft Delete
- Anonimizar não deleta dados, apenas remove informações pessoais
- Hash dos dados originais é mantido para verificação

### Auditoria Automática
- Toda mudança de status, assigned_user_id ou confidential é registrada
- Inclui quem fez, quando e o quê mudou

### Roles e Permissões
- **Admin:** Acesso total, pode anonimizar dados
- **Advogado:** Gerencia casos, atribui tarefas
- **Estagiário:** Suporte, adiciona notas

---

## 📊 Componente React

### CollaborationPanel
Painel lateral com 3 abas:
1. **Notas:** Adicionar/ver notas internas ou visíveis
2. **Auditoria:** Histórico de mudanças
3. **Atribuir:** Selecionar responsável

```jsx
import CollaborationPanel from '@/components/CollaborationPanel';

<CollaborationPanel conversationId={convId} caseId={caseId} />
```

**Botões exclusivos:** Apenas uma aba ativa por vez (outras desabilitadas)

---

## ⚠️ Pontos Importantes

1. **Auditoria automática:** Triggers registram mudanças automaticamente
2. **Soft delete:** Anonimizar não deleta, apenas remove dados pessoais
3. **Consentimento LGPD:** Registra IP e user agent para comprovação
4. **Confidencial visual:** Ícone/label destacado no painel
5. **Histórico completo:** Todas as operações críticas são rastreadas

---

## 🔮 Próximos Passos

1. Integrar permissões por role (quem pode fazer o quê)
2. Criar dashboard de LGPD (leads expirados, anonimizações)
3. Enviar notificações quando lead está próximo de expirar
4. Exportar relatório de auditoria por período
5. Integração com assinatura eletrônica para consentimentos

---

**Última atualização:** 2024-08-11  
**Status:** ✅ Implementado e pronto para uso  
**Deploy:** https://backend-apimeta.vercel.app
