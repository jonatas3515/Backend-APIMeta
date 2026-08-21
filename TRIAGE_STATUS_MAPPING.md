# Mapeamento de Status: review_status ↔ triage_status

## Sincronização Automática (Backend)

A sincronização entre `review_status` (legado) e `triage_status` (novo) é **automática** via trigger `sync_review_triage_status` no backend. Nenhuma atualização deve ocorrer apenas no frontend.

## Tabela de Mapeamento

### review_status → triage_status

| review_status (legado)      | triage_status (novo)        | Condição                          |
|-----------------------------|-----------------------------|-----------------------------------|
| `nova`                      | `novo`                      | -                                 |
| `revisada`                  | `revisado`                  | -                                 |
| `ignorada`                  | `ignorado`                  | -                                 |
| `convertida_em_nota`        | `convertido_em_nota`        | `note_id IS NOT NULL`             |
| `convertida_em_agenda`      | `convertido_em_agenda`      | `agenda_event_id IS NOT NULL`     |

### triage_status → review_status

| triage_status (novo)        | review_status (legado)      | Condição                          |
|-----------------------------|-----------------------------|-----------------------------------|
| `novo`                      | `nova`                      | -                                 |
| `em_analise`                | `nova`                      | -                                 |
| `revisado`                  | `revisada`                  | -                                 |
| `ignorado`                  | `ignorada`                  | -                                 |
| `convertido_em_nota`        | `convertida_em_nota`        | `note_id IS NOT NULL`             |
| `convertido_em_lembrete`    | `revisada`                  | `reminder_id IS NOT NULL`         |
| `convertido_em_agenda`      | `convertida_em_agenda`      | `agenda_event_id IS NOT NULL`     |

## Estados de Triagem

### `novo`
- Movimentação detectada, ainda não analisada
- Aguardando revisão humana

### `em_analise`
- Movimentação aberta para análise
- Usuário está revisando

### `revisado`
- Movimentação analisada e processada
- Marcada como revisada sem ação específica

### `convertido_em_nota`
- Movimentação convertida em nota interna
- FK `note_id` preenchido
- Nota vinculada ao caso

### `convertido_em_lembrete`
- Movimentação convertida em lembrete/tarefa
- FK `reminder_id` preenchido
- Lembrete vinculado à conversa/caso

### `convertido_em_agenda`
- Movimentação convertida em evento de agenda
- FK `agenda_event_id` preenchido
- Evento vinculado ao caso

### `ignorado`
- Movimentação não relevante
- Não requer ação

## Fluxo de Triagem

```
novo → em_analise → revisado
  ↓              ↓
ignorado         ├→ convertido_em_nota
                 ├→ convertido_em_lembrete
                 └→ convertido_em_agenda
```

## Ações Permitidas por Status

| Ação                        | novo | em_analise | revisado | ignorado |
|-----------------------------|------|------------|----------|----------|
| Abrir para análise          | ✅   | -          | -        | -        |
| Alterar classificação       | ✅   | ✅         | ❌       | ❌       |
| Definir prioridade          | ✅   | ✅         | ❌       | ❌       |
| Atribuir responsável        | ✅   | ✅         | ❌       | ❌       |
| Criar nota                  | ✅   | ✅         | ❌       | ❌       |
| Criar lembrete              | ✅   | ✅         | ❌       | ❌       |
| Criar evento de agenda      | ✅   | ✅         | ❌       | ❌       |
| Marcar como revisado        | ✅   | ✅         | -        | -        |
| Marcar como ignorado        | ✅   | ✅         | -        | -        |
| Reabrir                     | ❌   | ❌         | ✅       | ✅       |

## Permissões por Perfil

| Ação                        | Admin | Advogado | Estagiário |
|-----------------------------|-------|----------|------------|
| Visualizar fila             | ✅    | ✅       | ❌         |
| Abrir movimentação          | ✅    | ✅       | ❌         |
| Alterar classificação       | ✅    | ✅       | ❌         |
| Definir prioridade          | ✅    | ✅       | ❌         |
| Atribuir responsável        | ✅    | ✅       | ❌         |
| Marcar como revisado        | ✅    | ✅       | ❌         |
| Criar nota interna          | ✅    | ✅       | ❌         |
| Criar lembrete              | ✅    | ✅       | ❌         |
| Criar evento de agenda      | ✅    | ✅       | ❌         |
| Adicionar observação        | ✅    | ✅       | ❌         |
| Ver histórico de triagem    | ✅    | ✅       | ❌         |

**Nota:** Estagiários NÃO têm acesso à Central de Triagem nesta primeira fase.

## Vínculos com Outras Tabelas

### Nota Interna
- Tabela: `internal_notes`
- FK: `process_movements.note_id`
- Quando criada: `triage_status` → `revisado`, `review_status` → `convertida_em_nota`

### Lembrete
- Tabela: `chat_reminders`
- FK: `process_movements.reminder_id`
- Quando criado: mantém vínculo, mas não altera status automaticamente

### Evento de Agenda
- Tabela: `case_events`
- FK: `process_movements.agenda_event_id`
- Quando criado: `triage_status` → `revisado`, `review_status` → `convertida_em_agenda`

## Auditoria

Todas as ações de triagem são registradas em `triage_history`:
- Usuário que realizou a ação
- Data/hora
- Ação realizada
- Valores antigos e novos (status, classificação, prioridade)
- Observações

**Importante:** O histórico NÃO registra:
- Texto integral da movimentação
- Números de processo
- Dados de cliente ou PII
