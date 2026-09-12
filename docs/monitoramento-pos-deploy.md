# Monitoramento pós-deploy

Guia para acompanhar saúde, métricas e alertas do Backend-APIMeta após deploys, sem alterar schema, banco, RLS ou regras de autorização.

---

## 1. Métricas por feature

### 1.1 Endpoint

```text
GET /api/metrics
```

- **Requisito:** usuário autenticado com role `admin`.
- **Resposta esperada:**

```json
{
  "metrics": {
    "cases:link": 42,
    "cases:unlink": 3,
    "cases:create": 15,
    "document_requests:send": 8,
    "generated_documents:generate": 5,
    "case_routines:execute": 2,
    "fee_simulator:save": 4
  }
}
```

### 1.2 Métricas principais

Acompanhar os seguintes contadores, agrupados por `feature:action`:

| Grupo | Métricas |
|---|---|
| Casos | `cases:link`, `cases:unlink`, `cases:create`, `cases:update`, `cases:delete` |
| Solicitações de documentos | `document_requests:create`, `document_requests:send`, `document_requests:resend` |
| Documentos gerados | `generated_documents:generate`, `generated_documents:update`, `generated_documents:delete` |
| Rotinas | `case_routines:execute` |
| Honorários | `fee_simulator:save` |

### 1.3 Frequência de coleta

- **Horário de pico (09h–12h, 14h–18h):** coletar a cada 5 a 15 minutos.
- **Horário normal:** coletar a cada 30 minutos.
- **Pós-deploy crítico:** coletar imediatamente após deploy e depois a cada 5 minutos pelas primeiras 2 horas.

### 1.4 Identificação de anomalias

- Pico inesperado em `*:ERROR` ou `*:FORBIDDEN`.
- Queda repentina em contadores de sucesso (`*:SUCCESS`) sem justificativa operacional.
- Aumento súbito em `*:VALIDATION` indicando possível mudança de contrato ou dados inválidos.

---

## 2. Logs estruturados

### 2.1 Formato

Os logs são emitidos por `lib/logger.js` no formato JSON, com nível `info`, `warn` ou `error`, evento em `SCREAMING_SNAKE_CASE` e contexto sanitizado.

```json
{
  "level": "warn",
  "event": "CASE_UPDATE_FORBIDDEN",
  "timestamp": "2026-09-12T17:42:00.000Z",
  "context": {
    "userId": "uuid",
    "caseId": "uuid",
    "httpStatus": 403
  }
}
```

### 2.2 Eventos principais

- `CASE_LINK_CONVERSATION_*` / `CASE_UNLINK_CONVERSATION_*`
- `DOC_REQUEST_CREATE_DRAFT_*`, `DOC_REQUEST_SEND_*`, `DOC_REQUEST_RESEND_*`
- `GENERATED_DOCUMENTS_GENERATE_*`, `GENERATED_DOCUMENTS_UPDATE_*`, `GENERATED_DOCUMENTS_DELETE_*`
- `CASE_ROUTINES_*` / `ROUTINE_EXECUTE_*`
- `FEE_SIM_SAVE_*`

### 2.3 Correlação com métricas

- Aumento de `CASE_LINK_CONVERSATION_ERROR` com queda em `cases:link` indica falha operacional no vínculo.
- Aumento de `DOC_REQUEST_SEND_ERROR` com `document_requests:send` zerado sinaliza que nenhum envio está saindo.
- `GENERATED_DOCUMENTS_GENERATE_ERROR` alto pode indicar problema no template ou na conversa vinculada.

### 2.4 Padrões de log por situação

| Situação | Padrão do log | Ação |
|---|---|---|
| Sucesso | `level: info`, evento termina com `_SUCCESS` | Monitorar tendências |
| Permissão negada | `level: warn`, `httpStatus: 403` | Verificar RLS/regras de role |
| Recurso não encontrado | `level: warn`, `httpStatus: 404` | Validar IDs e vínculos |
| Conflito | `level: warn`, `httpStatus: 409` | Revisar estados e validações |
| Erro de rede/integração | `level: error`, `httpStatus: 500` | Investigar traceback (não exposto) e serviços externos |

---

## 3. Critérios de alerta

### 3.1 Erros 4xx/5xx

- **Threshold:** mais de 10% das requisições para um endpoint específico retornando 4xx/5xx em janela de 10 minutos.
- **Ação:** filtrar logs por `httpStatus` e `event` e identificar o padrão (RLS, validação, autenticação, etc.).

### 3.2 Rate limit (429)

- **Threshold:** qualquer 429 em `/api/notifications` ou endpoints críticos, ou padrão repetido de 429 para o mesmo `userId` em menos de 60 segundos.
- **Ação:** verificar `notificationCache` e o intervalo de polling; ajustar throttling no `NotificationProvider` se necessário.

### 3.3 RLS/autorização (403)

- **Threshold:** 403 em operações críticas (arquivar conversa, vincular conversa, executar rotina) ou qualquer log contendo `new row violates row-level security policy`.
- **Ação:**
  1. Reproduzir no ambiente de staging.
  2. Verificar funções de trigger (`SECURITY DEFINER`/`INVOKER`).
  3. Ajustar RLS no Supabase conforme necessário.

### 3.4 Integrações externas

- **Threshold:** 2 falhas consecutivas em chamadas externas (WhatsApp, DataJud, etc.).
- **Ação:** verificar credenciais, rate limits do serviço e logs sanitizados.

### 3.5 Resumo de alertas

| Alerta | O que observar | Threshold sugerido | Ação recomendada |
|---|---|---|---|
| Erros 4xx/5xx | Métricas + logs | > 10% em 10 min | Investigar logs, validar payload |
| 429 recorrente | Logs e cache | 3+ no mesmo usuário/1 min | Ajustar throttling/polling |
| 403 em ações críticas | Logs `FORBIDDEN` | Qualquer evento | Verificar RLS/políticas |
| RLS violation | Mensagem `new row violates...` | Qualquer ocorrência | Revisar triggers e funções no banco |
| Queda de ações de sucesso | Métricas | Queda > 50% | Revisar endpoints recentes |

---

## 4. Rotina de monitoramento

### 4.1 Período inicial (primeiras 2 semanas)

- 2 vezes ao dia, pela manhã e à tarde:
  1. Coletar `GET /api/metrics`.
  2. Revisar logs de `warn` e `error` das últimas 12 horas.
  3. Verificar se há 429/403 recorrentes.

### 4.2 Após estabilização

- 1 vez ao dia, de manhã:
  1. Coletar métricas.
  2. Verificar logs de `error`.
  3. Revisar alertas do dia anterior.

### 4.3 Checklist de investigação

Ao identificar anomalia:

1. Coletar snapshot de `/api/metrics`.
2. Filtrar logs do evento/endpoint afetado.
3. Anotar `userId`, `caseId`, `conversationId` (sem expor PII).
4. Verificar se coincide com deploy recente ou mudança no banco/RLS.
5. Reproduzir em staging.
6. Documentar resolução neste arquivo.

---

## 5. Dados sensíveis

- Nunca incluir nomes, e-mails, telefones, tokens, URLs assinadas ou conteúdo de mensagens em relatórios de monitoramento.
- Usar apenas IDs (`userId`, `caseId`, `conversationId`, `documentId`, `templateId`, `routineId`), `errorCode` e `httpStatus`.
