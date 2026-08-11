# Referência de Funil de Atendimento - Neves & Costa Chat

## 📋 Etapas Padronizadas do Funil

Todos os valores de `funnel_stage` devem estar em um dos seguintes estados:

| Stage ID | Label | Descrição | Quando usar |
|----------|-------|-----------|------------|
| `lead_novo` | 🆕 Lead Novo | Primeiro contato, antes de qualquer intake | Cliente acabou de enviar primeira mensagem |
| `intake_em_andamento` | 📝 Intake em Andamento | Cliente respondendo perguntas de triagem | Bot está coletando informações via intake |
| `intake_concluido` | ✅ Intake Concluído | Triagem finalizada, caso qualificado | Cliente respondeu todas as perguntas, caso é viável |
| `proposta_enviada` | 💰 Proposta Enviada | Proposta de serviço enviada ao cliente | Você enviou proposta de contratação |
| `contrato_assinado` | 📋 Contrato Assinado | Contrato assinado, caso ativo | Cliente assinou contrato, caso está em andamento |
| `acao_protocolada` | ⚖️ Ação Protocolada | Ação judicial protocolada | Ação foi protocolada em tribunal |
| `aguardando_decisao` | ⏳ Aguardando Decisão | Aguardando decisão judicial | Caso aguardando sentença/decisão |
| `encerrado` | 🏁 Encerrado | Caso finalizado/encerrado | Caso foi encerrado (ganho, perda ou desistência) |

## 🔄 Fluxo Esperado

```
lead_novo 
    ↓
intake_em_andamento 
    ↓
intake_concluido 
    ↓
proposta_enviada 
    ↓
contrato_assinado 
    ↓
acao_protocolada 
    ↓
aguardando_decisao 
    ↓
encerrado
```

**Nota:** Nem todos os casos seguem este fluxo linear. Alguns podem pular etapas ou voltar para etapas anteriores.

## 🗄️ Campos de Banco de Dados

### Tabela `conversations`

Campos relacionados ao funil:

```sql
funnel_stage VARCHAR(50)              -- Etapa atual do funil
funnel_stage_updated_at TIMESTAMPTZ   -- Quando foi a última mudança de stage
intake_started_at TIMESTAMPTZ         -- Quando o intake começou
intake_completed_at TIMESTAMPTZ       -- Quando o intake foi concluído
proposal_sent_at TIMESTAMPTZ          -- Quando a proposta foi enviada
contract_signed_at TIMESTAMPTZ        -- Quando o contrato foi assinado
action_filed_at TIMESTAMPTZ           -- Quando a ação foi protocolada
case_closed_at TIMESTAMPTZ            -- Quando o caso foi encerrado
has_case BOOLEAN                      -- Se há um caso jurídico associado
human_assigned_at TIMESTAMPTZ         -- Quando foi atribuído a humano
```

### Tabela `funnel_history`

Registra todas as mudanças de stage para auditoria:

```sql
id UUID                    -- ID único
conversation_id UUID       -- Referência à conversa
from_stage VARCHAR(50)     -- Stage anterior
to_stage VARCHAR(50)       -- Novo stage
changed_by VARCHAR(255)    -- Quem fez a mudança
reason TEXT                -- Motivo da mudança
created_at TIMESTAMPTZ     -- Quando foi feita a mudança
```

## 🔌 APIs de Funil

### GET /api/funnel?action=stages

Retorna contagem de conversas por etapa:

```json
{
  "stages": ["lead_novo", "intake_em_andamento", ...],
  "counts": {
    "lead_novo": 5,
    "intake_em_andamento": 3,
    ...
  },
  "total": 25
}
```

### GET /api/funnel?action=conversations&stage=intake_concluido

Retorna todas as conversas de uma etapa específica:

```json
[
  {
    "id": "uuid-123",
    "client_name": "João Silva",
    "client_phone": "5573991234567",
    "funnel_stage": "intake_concluido",
    "legal_area": "Direito Trabalhista",
    "has_case": false,
    "mode": "bot",
    ...
  }
]
```

### GET /api/funnel?action=metrics

Retorna métricas de funil e taxas de conversão:

```json
{
  "metrics": [
    {
      "funnel_stage": "lead_novo",
      "total_count": 10,
      "with_case_count": 2,
      "human_mode_count": 1,
      "avg_days_in_stage": "3.50"
    }
  ],
  "conversions": [
    {
      "funnel_stage": "lead_novo",
      "count": 10,
      "conversion_from_first": "100.00",
      "drop_rate_from_previous": null
    }
  ]
}
```

### PATCH /api/funnel

Muda o stage de uma conversa:

```json
{
  "conversation_id": "uuid-123",
  "new_stage": "intake_concluido",
  "reason": "Cliente respondeu todas as perguntas"
}
```

Resposta:

```json
{
  "success": true,
  "conversation": { ... },
  "message": "Conversa movida de intake_em_andamento para intake_concluido"
}
```

## 🎯 Regras de Negócio

### Quando mudar de stage automaticamente (no webhook)

1. **lead_novo → intake_em_andamento**: Quando o bot inicia o intake
2. **intake_em_andamento → intake_concluido**: Quando `handleIntake()` marca como completo
3. **intake_concluido → proposta_enviada**: Quando você envia proposta manualmente
4. **proposta_enviada → contrato_assinado**: Quando cliente confirma assinatura
5. **contrato_assinado → acao_protocolada**: Quando ação é protocolada
6. **acao_protocolada → aguardando_decisao**: Automático após protocolo
7. **aguardando_decisao → encerrado**: Quando há decisão final

### Quando criar um caso jurídico

- Criar automaticamente quando `funnel_stage === 'intake_concluido'`
- Ou permitir criação manual em qualquer stage
- Marcar `has_case = true` quando caso é criado

### Quando atribuir a humano

- Quando cliente pede "falar com advogado"
- Quando há prazo processual urgente
- Quando há dúvida sobre viabilidade do caso
- Quando cliente está insatisfeito

## 📊 Métricas Importantes

### Taxa de Conversão por Etapa

Percentual de conversas que avançam de uma etapa para a próxima:

```
Conversão = (Conversas em etapa N+1) / (Conversas em etapa N) * 100
```

### Tempo Médio em Cada Etapa

Dias que uma conversa leva em média para passar de uma etapa:

```
Tempo médio = (Data saída - Data entrada) / Número de conversas
```

### Taxa de Abandono

Conversas que ficam paradas em uma etapa por mais de X dias.

## 🛠️ Como Integrar no Webhook

### Exemplo: Marcar intake como concluído

```javascript
// No webhook.js, após handleIntake() retornar sucesso:
if (intakeResult && intakeResult.completed) {
  await supabase
    .from('conversations')
    .update({
      funnel_stage: 'intake_concluido',
      intake_completed_at: new Date().toISOString()
    })
    .eq('id', conversation.id);
}
```

### Exemplo: Criar caso automaticamente

```javascript
// Após intake concluído:
if (conversation.funnel_stage === 'intake_concluido' && !conversation.has_case) {
  const { data: caseData } = await supabase
    .from('cases')
    .insert({
      conversation_id: conversation.id,
      title: `${conversation.legal_area} - ${conversation.client_name}`,
      legal_area: conversation.legal_area,
      case_type: conversation.case_type,
      municipality: conversation.municipality,
      status: 'em_analise',
      priority: 'media'
    });

  if (caseData) {
    await supabase
      .from('conversations')
      .update({ has_case: true })
      .eq('id', conversation.id);
  }
}
```

## 🎨 Componentes React

### FunnelKanban

Visualização em Kanban com drag-and-drop:

```jsx
import FunnelKanban from '@/components/FunnelKanban';

<FunnelKanban 
  conversations={conversations}
  onSelectConversation={(conv) => handleSelect(conv)}
/>
```

### FunnelMetrics

Painel de métricas e taxas de conversão:

```jsx
import FunnelMetrics from '@/components/FunnelMetrics';

<FunnelMetrics />
```

## ⚠️ Pontos Importantes

1. **Sempre use os valores padronizados** de `funnel_stage` listados acima
2. **Registre timestamps** quando mudar de stage (automático via trigger)
3. **Auditoria**: Todas as mudanças são registradas em `funnel_history`
4. **Não quebra dados existentes**: Migration usa `ALTER TABLE` com `IF NOT EXISTS`
5. **Views automáticas**: `funnel_metrics` e `funnel_conversion_rates` calculam automaticamente

## 🔮 Próximos Passos

1. Integrar automação de stage no webhook
2. Criar lembretes para conversas paradas em um stage
3. Gerar relatórios de funil por período
4. Análise de drop-off (onde clientes abandonam)
5. Previsão de conversão baseada em histórico

---

**Última atualização:** 2024-08-11  
**Status:** ✅ Implementado e pronto para uso
