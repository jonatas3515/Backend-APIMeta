# 📋 Exemplo de Migração: Usando apiClient

## Antes: Usando fetch direto (❌ Retorna 401)

```javascript
// components/SendMessageExample.js
import { useState } from 'react';

export default function SendMessage({ conversationId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSend = async (text) => {
    setLoading(true);
    setError(null);

    try {
      // ❌ Sem token de autenticação
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          text: text
        })
      });

      if (!response.ok) {
        throw new Error(`Erro ${response.status}`);
      }

      const data = await response.json();
      console.log('Mensagem enviada:', data);
    } catch (err) {
      setError(err.message);
      console.error('Erro:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={() => handleSend('Olá')}>
      {loading ? 'Enviando...' : 'Enviar'}
    </button>
  );
}
```

**Resultado:** `401 Unauthorized`

---

## Depois: Usando apiClient (✅ Funciona)

```javascript
// components/SendMessageExample.js
import { useState } from 'react';
import apiCall from '@/lib/apiClient';

export default function SendMessage({ conversationId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSend = async (text) => {
    setLoading(true);
    setError(null);

    try {
      // ✅ Com token de autenticação automático
      const response = await apiCall('/api/send-message', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: conversationId,
          text: text
        })
      });

      if (!response.ok) {
        throw new Error(`Erro ${response.status}`);
      }

      const data = await response.json();
      console.log('Mensagem enviada:', data);
    } catch (err) {
      setError(err.message);
      console.error('Erro:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={() => handleSend('Olá')}>
      {loading ? 'Enviando...' : 'Enviar'}
    </button>
  );
}
```

**Resultado:** `200 OK` + dados da resposta

---

## Mudanças Necessárias

### 1. Importar apiCall

```javascript
// Adicionar no topo do arquivo
import apiCall from '@/lib/apiClient';
```

### 2. Substituir fetch por apiCall

```javascript
// Antes
const response = await fetch('/api/endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});

// Depois
const response = await apiCall('/api/endpoint', {
  method: 'POST',
  body: JSON.stringify(data)
});
```

**Nota:** Não precisa adicionar `Content-Type: application/json` porque `apiCall` já adiciona automaticamente.

### 3. Tratamento de Erros (Opcional)

```javascript
try {
  const response = await apiCall('/api/send-message', options);
  
  if (response.status === 401) {
    // Token inválido mesmo após retry
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  
  if (response.status === 403) {
    throw new Error('Você não tem permissão para acessar este recurso.');
  }
  
  if (!response.ok) {
    throw new Error(`Erro ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data;
} catch (error) {
  console.error('Erro na requisição:', error);
  throw error;
}
```

---

## Exemplo Real: ChatWindow.js

### Antes (linha ~300)

```javascript
// Enviar mensagem via WhatsApp
const response = await fetch('/api/send-message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...await getAuthHeaders() // Tinha que fazer manualmente
  },
  body: JSON.stringify({
    conversation_id: conversation.id,
    text: newMessage,
    media_url: pendingFile?.url || null,
    media_type: pendingFile?.type || null
  })
});
```

### Depois

```javascript
// Enviar mensagem via WhatsApp
const response = await apiCall('/api/send-message', {
  method: 'POST',
  body: JSON.stringify({
    conversation_id: conversation.id,
    text: newMessage,
    media_url: pendingFile?.url || null,
    media_type: pendingFile?.type || null
  })
});
```

**Benefícios:**
- ✅ Mais limpo e legível
- ✅ Sem necessidade de importar `getAuthHeaders`
- ✅ Renovação automática de token
- ✅ Retry automático em caso de 401

---

## Componentes que Precisam Ser Atualizados

Baseado na busca anterior, estes componentes fazem requisições e devem usar `apiCall`:

1. **ChatWindow.js** - Enviar mensagens
2. **NotificationProvider.js** - Buscar notificações
3. **CasesPanel.js** - CRUD de casos
4. **AgendaPanel.js** - Buscar agenda
5. **CaseInsightsPanel.js** - Gerenciar insights
6. **CollaborationPanel.js** - Notas e auditoria
7. **RemindersPanel.js** - Gerenciar lembretes
8. **DocumentTemplatesManager.js** - Gerenciar templates
9. **LegalRoutinesManager.js** - Gerenciar rotinas
10. E outros...

---

## Checklist de Migração

Para cada componente:

- [ ] Adicionar `import apiCall from '@/lib/apiClient'`
- [ ] Remover `import { getAuthHeaders } from '@/lib/api'` (se houver)
- [ ] Substituir `fetch()` por `apiCall()`
- [ ] Remover `headers: { ...await getAuthHeaders() }` (se houver)
- [ ] Testar a requisição
- [ ] Verificar se retorna dados corretos
- [ ] Validar tratamento de erros

---

## Teste Rápido

Para verificar se está funcionando:

```javascript
// No console do navegador
import apiCall from '/lib/apiClient.js';

const response = await apiCall('/api/notifications/count');
const data = await response.json();
console.log(data); // Deve mostrar { unreadCount: X, ... }
```

Se retornar dados, está funcionando! ✅

---

## Suporte

Se encontrar erros:

1. Verifique se o usuário está autenticado
2. Verifique se o token não expirou
3. Verifique os logs do navegador (console)
4. Verifique os logs do servidor (Vercel)
5. Abra uma issue com os detalhes do erro
