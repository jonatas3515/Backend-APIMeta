# Agenda Jurídica - Guia Completo

## 📅 O que foi implementado

### 1. **Banco de Dados (Migration 027)**

#### Campos adicionados em `chat_reminders`
- `priority` - Prioridade: baixa, media, alta
- `case_id` - Referência ao caso (opcional)
- `reminder_type` - Tipo: prazo_judicial, lembrete_cliente, prazo_interno, reuniao, audiencia, outro

#### Tabela `case_events`
```sql
id, case_id, event_date, event_time, event_type, description, priority, location, created_by_user_id, created_at, updated_at
```
- Permite múltiplos eventos por caso
- Exemplo: audiências, prazos judiciais, reuniões, prazos administrativos

#### View `agenda_consolidada`
Consolida 3 fontes em uma única agenda:
1. **Prazos de cases** (deadline_date)
2. **Lembretes** (chat_reminders com scheduled_for)
3. **Eventos** (case_events)

#### Funções SQL
- `get_agenda()` - Busca itens com filtros por intervalo, área, município, agência, prioridade
- `count_agenda_by_day()` - Conta itens por dia e prioridade

---

### 2. **APIs**

#### GET /api/agenda
Retorna agenda agrupada por dia:
```bash
GET /api/agenda?range=today
GET /api/agenda?range=week
GET /api/agenda?range=month
GET /api/agenda?start_date=2024-08-11&end_date=2024-08-31
GET /api/agenda?legal_area=Trabalhista&priority=alta
```

Resposta:
```json
{
  "range": "today",
  "start_date": "2024-08-11",
  "end_date": "2024-08-11",
  "by_day": {
    "2024-08-11": [
      {
        "item_type": "case_deadline",
        "case_id": "uuid",
        "title": "Audiência trabalhista",
        "event_date": "2024-08-11",
        "event_type": "data_de_audiencia",
        "priority": "alta",
        "legal_area": "Direito Trabalhista",
        "case_type": "Licença Prêmio",
        "municipality": "Prado",
        "agency": "Prefeitura"
      }
    ]
  },
  "total_items": 1
}
```

#### GET /api/agenda?action=today
Retorna apenas itens de hoje:
```json
{
  "date": "2024-08-11",
  "items": [...],
  "total": 3
}
```

#### GET /api/agenda?action=count
Retorna contagem por dia e prioridade:
```json
[
  {
    "event_date": "2024-08-11",
    "total_items": 5,
    "alta_priority": 2,
    "media_priority": 2,
    "baixa_priority": 1
  }
]
```

#### POST /api/agenda
Gera resumo com IA:
```json
{
  "action": "summary",
  "range": "today"
}
```

Resposta:
```json
{
  "range": "today",
  "start_date": "2024-08-11",
  "end_date": "2024-08-11",
  "total_items": 3,
  "summary": "Hoje você tem 3 prazos principais: 1 audiência trabalhista em Prado/BA, 1 prazo de recurso administrativo e 1 lembrete de documentos pendentes para servidor municipal."
}
```

---

### 3. **Componente React**

#### AgendaPanel.js
Painel com 4 abas (botões exclusivos):

**1. 📆 Hoje**
- Mostra apenas itens de hoje
- Filtros por área, prioridade
- Resumo diário com IA

**2. 📊 Próximos 7 dias**
- Agenda da próxima semana
- Agrupada por dia
- Cores por prioridade

**3. 📈 Próximos 30 dias**
- Visão mensal
- Planejamento estratégico
- Filtros avançados

**Recursos:**
- ✨ **Botão "Gerar Resumo com IA"** - Cria resumo executivo
- 📋 **Botão "Copiar"** - Copia resumo para clipboard
- 🎨 **Cores por prioridade:**
  - 🔴 Alta (vermelho)
  - 🟡 Média (amarelo)
  - 🟢 Baixa (verde)
- 📌 **Ícones por tipo:**
  - ⚖️ Prazo de caso
  - 🔔 Lembrete
  - 📅 Evento

---

## 🎯 Fluxo de Uso

### 1. Criar Caso com Prazo
```
1. Painel → Casos → + Novo Caso
2. Preencher deadline_date, deadline_type, priority
3. Salvar
4. Prazo aparece automaticamente na agenda
```

### 2. Criar Lembrete
```
1. Painel → Lembretes → + Novo Lembrete
2. Preencher scheduled_for, priority, reminder_type
3. Salvar
4. Lembrete aparece na agenda
```

### 3. Criar Evento de Caso
```
1. Painel → Caso → + Novo Evento
2. Preencher event_date, event_type, priority
3. Salvar
4. Evento aparece na agenda
```

### 4. Consultar Agenda
```
1. Painel → Agenda Jurídica
2. Selecionar período (Hoje, 7 dias, 30 dias)
3. Filtrar por área, prioridade
4. Ver itens agrupados por dia
```

### 5. Gerar Resumo Diário
```
1. Painel → Agenda Jurídica
2. Clique em "✨ Gerar Resumo com IA"
3. Sistema gera resumo executivo
4. Clique em "📋 Copiar" para usar em outro lugar
```

---

## 📊 Exemplos de Agenda

### Exemplo 1: Hoje (11/08/2024)
```
📆 Domingo, 11 de agosto de 2024 (3 itens)

🔴 ALTA PRIORIDADE
⚖️ Audiência trabalhista – João Silva
   Tipo: data_de_audiencia
   Área: Direito Trabalhista
   Município: Prado/BA
   Horário: 14:30

🟡 MÉDIA PRIORIDADE
🔔 Prazo para recurso administrativo
   Tipo: prazo_para_recurso
   Área: Direito Previdenciário
   Município: Itabuna/BA

🟢 BAIXA PRIORIDADE
📅 Reunião com cliente
   Tipo: reuniao
   Área: Direito Civil
   Horário: 10:00
```

### Exemplo 2: Próximos 7 dias
```
📆 Domingo, 11 de agosto de 2024 (3 itens)
   [itens de hoje]

📆 Segunda, 12 de agosto de 2024 (2 itens)
   ⚖️ Prazo para ajuizar ação
   🔔 Lembrete: buscar documentos

📆 Terça, 13 de agosto de 2024 (1 item)
   📅 Audiência previdenciária

[...]
```

---

## 🔍 Filtros Disponíveis

| Filtro | Valores | Exemplo |
|--------|---------|---------|
| **range** | today, week, month | `?range=week` |
| **legal_area** | Qualquer área | `?legal_area=Trabalhista` |
| **municipality** | Qualquer município | `?municipality=Prado` |
| **agency** | Qualquer agência | `?agency=Prefeitura` |
| **priority** | alta, media, baixa | `?priority=alta` |

---

## 🎨 Prioridades

| Prioridade | Cor | Ícone | Uso |
|-----------|-----|-------|-----|
| **Alta** | Vermelho | 🔴 | Prazos urgentes, audiências próximas |
| **Média** | Amarelo | 🟡 | Prazos normais, lembretes importantes |
| **Baixa** | Verde | 🟢 | Lembretes informativos, tarefas rotineiras |

---

## 📝 Tipos de Eventos

| Tipo | Descrição | Exemplo |
|------|-----------|---------|
| **prazo_judicial** | Prazo para ação judicial | Prazo para ajuizar ação (30 dias) |
| **lembrete_cliente** | Lembrete para cliente | Buscar documentos, agendar reunião |
| **prazo_interno** | Prazo interno do escritório | Preparar parecer, revisar contrato |
| **reuniao** | Reunião agendada | Reunião com cliente, com tribunal |
| **audiencia** | Audiência judicial | Audiência trabalhista, previdenciária |
| **outro** | Outro tipo | Qualquer outro evento |

---

## ⚙️ Integração com Lembretes Existentes

A agenda consome dados de `chat_reminders` que já existem:

1. **Lembretes pendentes** aparecem na agenda
2. **Lembretes enviados** não aparecem (status = 'sent')
3. **Prioridade** é herdada do lembrete
4. **Tipo** categoriza o lembrete na agenda

---

## 🚀 Performance

### Índices Criados
- `idx_cases_deadline_date` - Busca rápida por prazos
- `idx_chat_reminders_scheduled` - Busca rápida por lembretes
- `idx_case_events_date` - Busca rápida por eventos

### Limites
- Máximo 30 dias por consulta (padrão)
- Máximo 1000 itens por resposta
- Timeout de 12s para geração de IA

---

## 📱 Resumo com IA

O resumo é gerado usando Gemini API:

**Características:**
- Destaca itens de alta prioridade
- Menciona quantidade total
- Tom conversacional, não formal
- Útil para advogado ocupado

**Exemplo de resumo:**
```
"Hoje você tem 3 prazos principais: 1 audiência trabalhista em Prado/BA, 
1 prazo de recurso administrativo e 1 lembrete de documentos pendentes 
para servidor municipal."
```

---

## 🔮 Próximos Passos

1. **Dashboard de Métricas**
   - Gráficos de prazos por mês
   - Taxa de cumprimento de prazos
   - Prazos perdidos (histórico)

2. **Notificações**
   - Alertas 24h antes de prazo
   - Alertas 1h antes de audiência
   - Notificações via WhatsApp

3. **Integração com Calendário**
   - Exportar para Google Calendar
   - Exportar para Outlook
   - Sincronização automática

4. **Relatórios**
   - Relatório mensal de prazos
   - Relatório de audiências
   - Relatório de cumprimento

5. **Automação**
   - Criar lembretes automaticamente ao criar caso
   - Sugerir prioridade baseado em tipo de caso
   - Alertas automáticos para prazos próximos

---

## 📚 Campos de Caso para Agenda

Ao criar/editar um caso, preencher:

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| **deadline_date** | DATE | Não | Data do prazo principal |
| **deadline_type** | VARCHAR | Não | Tipo de prazo (audiência, recurso, etc.) |
| **priority** | VARCHAR | Não | Prioridade (alta, media, baixa) |

---

## 📚 Campos de Lembrete para Agenda

Ao criar/editar um lembrete, preencher:

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| **scheduled_for** | TIMESTAMPTZ | Sim | Data/hora do lembrete |
| **priority** | VARCHAR | Não | Prioridade (alta, media, baixa) |
| **reminder_type** | VARCHAR | Não | Tipo de lembrete |
| **case_id** | UUID | Não | Caso associado (opcional) |

---

**Última atualização:** 2024-08-11  
**Status:** ✅ Implementado e pronto para uso  
**Deploy:** https://backend-apimeta.vercel.app
