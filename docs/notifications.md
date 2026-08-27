# 🔔 Central de Notificações - Documentação

## Visão Geral

A Central de Notificações é um sistema interno que agrega notificações e pendências de múltiplas fontes para usuários logados, sem criar tabelas adicionais ou enviar notificações push.

## Arquitetura

### Abordagem: Agregação On-Demand (Fase 1)

- **Sem migration**: Usa fontes existentes como verdade
- **Sem push real**: Apenas exibição interna no painel
- **Cache 60s**: Reduz carga no banco
- **Rate limiting**: 1 request/segundo por usuário

### Fontes de Notificações

| Fonte | Tabela | Condição | Permissão |
|---|---|---|---|
| Mensagens não lidas | `conversations` | `unread = true` | `assigned_user_id` ou admin |
| Lembretes | `chat_reminders` | Não completed/cancelled | `created_by_user_id` ou admin |
| Prazos de casos | `cases` | `deadline_date` próximo | Via `conversation.assigned_user_id` |
| Eventos | `case_events` | `event_date = today` | Via `case_id → conversation` |
| Casos críticos | `cases` | `priority = 'alta'` + sem atualização 7+ dias | Via `conversation.assigned_user_id` |
| Movimentações DataJud | `process_movements` | `reviewed_at IS NULL` | Via `case_id → conversation` |
| Assinaturas | `document_signatures` | `status = 'pending'` | `created_by_user_id` ou admin |

## APIs

### GET /api/notifications

Retorna lista agregada de notificações para o usuário autenticado.

**Headers:**
```
x-user-id: <uuid>
x-user-role: admin|advogado|estagiario
```

**Response:**
```json
{
  "notifications": [
    {
      "id": "deadline-123",
      "type": "deadline_overdue",
      "reference_type": "case",
      "reference_id": "case-456",
      "title": "Prazo vencido - Trabalhista - São Paulo",
      "priority": "critical",
      "isOverdue": true,
      "isToday": false,
      "createdAt": "2024-01-15T10:00:00Z",
      "link": "/?case=case-456",
      "readAt": null
    }
  ],
  "errors": [],
  "cached": false,
  "duration": 234
}
```

**Tipos de notificação:**
- `message`: Nova mensagem não lida
- `deadline`: Prazo próximo
- `deadline_overdue`: Prazo vencido
- `deadline_today`: Prazo hoje
- `reminder`: Lembrete pendente
- `reminder_overdue`: Lembrete vencido
- `event_today`: Evento hoje
- `case_critical`: Caso crítico sem atualização
- `process_movement`: Nova movimentação processual
- `signature`: Assinatura pendente

**Prioridades:**
- `critical`: Vencido ou hoje
- `high`: Casos críticos, processos, assinaturas
- `normal`: Mensagens, lembretes
- `low`: Outros

### GET /api/notifications/count

Retorna contagem rápida para o badge.

**Response:**
```json
{
  "unreadCount": 5,
  "cached": false
}
```

## Segurança

### Proteção de PII

**❌ NUNCA expor:**
- Nome completo do cliente
- CPF, telefone, e-mail
- Número de processo completo
- URL assinada, storage_path
- Conteúdo de mensagem
- Token ou payload sensível

**✅ Permitido:**
- Tipo de item (Prazo, Lembrete, Caso)
- Área jurídica (Trabalhista, Previdenciário)
- Município/Órgão (se não sensível)
- Data/hora relativa ("há 2 horas", "vence hoje")
- Prioridade (alta, média, baixa)

### Permissões

**Admin:**
- Vê todas as notificações

**Advogado:**
- Vê apenas itens atribuídos a ele
- Vê assinaturas criadas por ele

**Estagiário:**
- Vê apenas itens atribuídos a ele
- **NÃO** vê assinaturas

### Filtros de Segurança

Todas as queries aplicam filtros no backend:

```javascript
// Exemplo: Prazos
if (userRole !== 'admin') {
  // Filtra por assigned_user_id via join
  filtered = data.filter(c => 
    c.conversations?.assigned_user_id === userId
  );
}
```

## Cache e Performance

### Cache LRU

- **TTL**: 60 segundos
- **Max size**: 500 usuários
- **Tipos**: `notifications`, `count`

```javascript
// Uso
const cached = notificationCache.get(userId, 'notifications');
if (cached) {
  return cached;
}

// Invalidar
notificationCache.invalidate(userId); // Um usuário
notificationCache.invalidateAll(); // Todos
```

### Rate Limiting

- **Limite**: 1 request/segundo por usuário
- **Resposta**: HTTP 429 Too Many Requests

## Helpers

### sanitizeNotificationTitle(item, type)

Remove PII e retorna título seguro.

```javascript
const title = sanitizeNotificationTitle(
  { legal_area: 'Trabalhista', municipality: 'São Paulo' },
  'deadline'
);
// "Prazo de caso Trabalhista - São Paulo"
```

### prioritizeNotification(item, type)

Define prioridade baseada no tipo e estado.

```javascript
const priority = prioritizeNotification({}, 'deadline_overdue');
// "critical"
```

### getNotificationRoute(notification)

Gera rota segura para o módulo de origem.

```javascript
const route = getNotificationRoute({
  type: 'deadline',
  reference_id: 'case-123'
});
// "/?case=case-123"
```

### formatRelativeDate(date, context)

Formata data de forma relativa.

```javascript
formatRelativeDate(twoHoursAgo, 'past'); // "há 2h"
formatRelativeDate(tomorrow, 'future'); // "amanhã"
```

## Limitações (Fase 1)

### ❌ Não Implementado

- Service Worker / VAPID
- Push notifications real
- Notificações offline
- Histórico completo persistente
- Envio de e-mail/WhatsApp automático
- Criação automática de prazos/tarefas

### ✅ Implementado

- Agregação on-demand
- Cache e rate limiting
- Filtros por permissão
- Sanitização de PII
- Falha parcial resiliente
- Badge com contagem

## Testes

### Cobertura Mínima: 80%

**Testes obrigatórios:**
- ✅ Agregação de todas as fontes
- ✅ Permissões por role
- ✅ Sem PII em títulos
- ✅ Priorização correta
- ✅ Roteamento para módulo correto
- ✅ Falha parcial não quebra sistema
- ✅ Badge mostra contagem correta
- ✅ Cache funciona corretamente

**Executar:**
```bash
npm test -- notifications
```

## Fase 2 (Futura)

**Não implementar agora:**
- Tabela `user_notifications` persistente
- Service Worker registration
- VAPID keys e push subscription
- Background sync
- Notificações offline
- Histórico completo

## Troubleshooting

### Notificações não aparecem

1. Verificar autenticação (headers `x-user-id`, `x-user-role`)
2. Verificar permissões (assigned_user_id)
3. Verificar cache (invalidar se necessário)
4. Verificar logs de erro nas fontes

### Badge mostra contagem errada

1. Limpar cache: `notificationCache.invalidate(userId)`
2. Verificar filtros de permissão
3. Verificar queries de contagem

### Performance lenta

1. Verificar cache hit rate
2. Verificar índices no banco
3. Reduzir limite de itens por fonte
4. Aumentar TTL do cache (cuidado com dados desatualizados)

## Suporte

Para dúvidas ou problemas:
1. Verificar logs: `[NOTIFICATIONS]` prefix
2. Verificar testes: `npm test -- notifications`
3. Verificar documentação de cada fonte

---

**Versão:** 1.0.0 (Fase 1)  
**Data:** 2024  
**Status:** ✅ Backend completo, Frontend em desenvolvimento
