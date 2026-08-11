# Guia de Templates de Documentos e Rotinas Jurídicas

## 📋 O que foi implementado

### 1. **Tabelas no Supabase (Migration 023)**

#### `document_templates`
Templates reutilizáveis de documentos:
- `id`, `name`, `description`
- `legal_area`, `case_type` (para filtrar)
- `template_text` (texto com placeholders)
- `placeholders` (array de placeholders usados)
- `is_active`, `created_at`, `updated_at`

#### `legal_routines`
Rotinas automatizadas por área/tipo/stage:
- `id`, `name`, `description`
- `legal_area` (obrigatório), `case_type`, `funnel_stage`
- `steps` (array de passos/instruções)
- `documents_to_generate` (array de IDs de templates)
- `reminders_to_create` (array de lembretes com prazos)
- `is_active`, `created_at`, `updated_at`

#### `generated_documents`
Documentos gerados a partir de templates:
- `id`, `conversation_id`, `case_id`
- `template_id`, `title`, `content`
- `status` (draft, review, approved, sent)
- `generated_at`, `updated_at`

#### `routine_executions`
Histórico de execução de rotinas:
- `id`, `conversation_id`, `case_id`, `routine_id`
- `status` (pending, in_progress, completed, failed)
- `documents_generated`, `reminders_created` (arrays)
- `executed_at`, `created_at`, `updated_at`

---

## 🔌 APIs

### Templates

#### GET /api/templates
Lista templates ativos com filtros:
```bash
GET /api/templates?legal_area=Direito Trabalhista&case_type=Licença Prêmio
```

#### GET /api/templates?id=<id>
Retorna template específico

#### GET /api/templates?action=generate&template_id=<id>&conversation_id=<id>
Gera documento a partir de template, substituindo placeholders:
```json
{
  "id": "uuid",
  "conversation_id": "uuid",
  "template_id": "uuid",
  "title": "Petição Inicial",
  "content": "Requerimento de João Silva para Campo Largo...",
  "status": "draft"
}
```

#### POST /api/templates
Cria novo template:
```json
{
  "name": "Petição Inicial - Licença Prêmio",
  "description": "Petição para requerimento de licença prêmio",
  "legal_area": "Direito Trabalhista",
  "case_type": "Licença Prêmio",
  "template_text": "Excelentíssimo Senhor Juiz de Direito...\n\nRequerente: {{client_name}}\nMunicípio: {{municipality}}\n\n{{case_summary}}"
}
```

#### PATCH /api/templates?id=<id>
Atualiza template

#### DELETE /api/templates?id=<id>
Soft delete (marca como inativo)

---

### Rotinas

#### GET /api/routines
Lista rotinas ativas com filtros:
```bash
GET /api/routines?legal_area=Direito Trabalhista&funnel_stage=intake_concluido
```

#### GET /api/routines?action=suggest&conversation_id=<id>
Sugere rotinas para uma conversa (baseado em legal_area, case_type, funnel_stage):
```json
[
  {
    "id": "uuid",
    "name": "Rotina Licença Prêmio",
    "legal_area": "Direito Trabalhista",
    "case_type": "Licença Prêmio",
    "steps": [
      { "description": "Verificar documentação do cliente", "order": 1 },
      { "description": "Preparar petição inicial", "order": 2 }
    ],
    "documents_to_generate": ["uuid-template-1", "uuid-template-2"]
  }
]
```

#### GET /api/routines?action=execute&routine_id=<id>&conversation_id=<id>&case_id=<id>
Executa uma rotina (cria documentos e lembretes em lote):
```json
{
  "execution": {
    "id": "uuid",
    "status": "completed",
    "executed_at": "2024-08-11T14:30:00Z"
  },
  "documentsGenerated": ["uuid-doc-1", "uuid-doc-2"],
  "remindersCreated": ["uuid-reminder-1"]
}
```

#### POST /api/routines
Cria nova rotina:
```json
{
  "name": "Rotina Licença Prêmio",
  "description": "Rotina completa para casos de licença prêmio",
  "legal_area": "Direito Trabalhista",
  "case_type": "Licença Prêmio",
  "funnel_stage": "intake_concluido",
  "steps": [
    { "description": "Verificar documentação", "order": 1 },
    { "description": "Preparar petição", "order": 2 },
    { "description": "Enviar ao cliente para revisão", "order": 3 }
  ],
  "documents_to_generate": ["uuid-template-1"],
  "reminders_to_create": [
    {
      "type": "deadline",
      "title": "Prazo para ajuizar ação",
      "message": "Prazo de 2 anos para ajuizar ação de licença prêmio",
      "days_from_now": 30
    }
  ]
}
```

#### PATCH /api/routines?id=<id>
Atualiza rotina

#### DELETE /api/routines?id=<id>
Soft delete (marca como inativo)

---

## 📝 Placeholders Disponíveis

Ao criar um template, use os seguintes placeholders:

| Placeholder | Descrição | Exemplo |
|------------|-----------|---------|
| `{{client_name}}` | Nome do cliente | João Silva |
| `{{client_phone}}` | Telefone do cliente | (73) 99123-4567 |
| `{{municipality}}` | Município | Campo Largo |
| `{{agency}}` | Órgão/entidade | Prefeitura Municipal |
| `{{client_role}}` | Papel do cliente | Servidor Efetivo |
| `{{case_type}}` | Tipo de caso | Licença Prêmio |
| `{{legal_area}}` | Área jurídica | Direito Trabalhista |
| `{{case_summary}}` | Resumo do caso | Requerimento de licença prêmio não concedida |
| `{{date}}` | Data atual | 11/08/2024 |
| `{{year}}` | Ano atual | 2024 |

---

## 🎯 Fluxo de Uso

### 1. Criar Templates
1. Acesse "Documentos" no painel
2. Clique "+ Novo Template"
3. Preencha:
   - Nome: "Petição Inicial - Licença Prêmio"
   - Área: "Direito Trabalhista"
   - Tipo: "Licença Prêmio"
   - Texto com placeholders
4. Salve

### 2. Criar Rotinas
1. Acesse "Rotinas" no painel
2. Clique "+ Nova Rotina"
3. Preencha:
   - Nome: "Rotina Licença Prêmio"
   - Área: "Direito Trabalhista"
   - Tipo: "Licença Prêmio"
   - Stage: "intake_concluido" (quando aplicar)
   - Passos (instruções)
   - Selecione templates a gerar
4. Salve

### 3. Sugerir Rotinas para Conversa
Quando uma conversa chegar em `intake_concluido`:
1. Sistema sugere rotinas automaticamente
2. Você clica "Executar Rotina"
3. Sistema gera documentos e cria lembretes

### 4. Gerar Documentos Manualmente
1. Abra conversa
2. Clique "Gerar Documento"
3. Selecione template
4. Sistema substitui placeholders e cria draft
5. Você revisa e aprova

---

## 🔧 Integração no Webhook

### Exemplo: Sugerir rotinas após intake concluído

```javascript
// No webhook.js, após handleIntake() retornar completed:
if (intakeResult && intakeResult.completed) {
  // Atualiza stage
  await supabase
    .from('conversations')
    .update({
      funnel_stage: 'intake_concluido',
      intake_completed_at: new Date().toISOString()
    })
    .eq('id', conversation.id);

  // Busca rotinas sugeridas
  const { data: suggestedRoutines } = await supabase
    .from('legal_routines')
    .select('*')
    .eq('legal_area', conversation.legal_area)
    .eq('funnel_stage', 'intake_concluido')
    .eq('is_active', true);

  if (suggestedRoutines && suggestedRoutines.length > 0) {
    const routineNames = suggestedRoutines.map(r => r.name).join(', ');
    const reply = `Intake concluído! 📋\n\nRotinas sugeridas: ${routineNames}\n\nNossa equipe irá revisar e aplicar as rotinas necessárias.`;
    
    await saveMessage(conversation.id, reply, 'bot');
  }
}
```

### Exemplo: Executar rotina automaticamente

```javascript
// Quando conversa chegar em intake_concluido:
const { data: routine } = await supabase
  .from('legal_routines')
  .select('*')
  .eq('legal_area', conversation.legal_area)
  .eq('case_type', conversation.case_type)
  .eq('funnel_stage', 'intake_concluido')
  .eq('is_active', true)
  .single();

if (routine) {
  // Executa rotina
  await fetch('/api/routines?action=execute', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      routine_id: routine.id,
      conversation_id: conversation.id,
      case_id: conversation.case_id
    })
  });
}
```

---

## 📊 Componentes React

### DocumentTemplatesManager
Gerencia templates de documentos:
```jsx
import DocumentTemplatesManager from '@/components/DocumentTemplatesManager';

<DocumentTemplatesManager />
```

### LegalRoutinesManager
Gerencia rotinas jurídicas:
```jsx
import LegalRoutinesManager from '@/components/LegalRoutinesManager';

<LegalRoutinesManager />
```

---

## ⚠️ Pontos Importantes

1. **Soft Delete:** Deletar template/rotina marca como `is_active = false`, não deleta do banco
2. **Placeholders:** Use exatamente `{{placeholder}}` (com chaves duplas)
3. **Ordem de Execução:** Rotinas geram documentos primeiro, depois criam lembretes
4. **Histórico:** Todas as execuções são registradas em `routine_executions`
5. **Sem Quebra:** Novos templates/rotinas não afetam fluxo existente

---

## 🔮 Próximos Passos

1. Integrar sugestão automática de rotinas no painel
2. Criar interface de aprovação de documentos gerados
3. Adicionar templates por município/órgão
4. Gerar relatório de documentos gerados por período
5. Versionamento de templates (histórico de mudanças)
6. Integração com assinatura eletrônica

---

**Última atualização:** 2024-08-11  
**Status:** ✅ Implementado e pronto para uso
