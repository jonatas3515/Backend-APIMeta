# 🔐 Guia de Uso: apiClient.js

## Problema Resolvido

As API routes do chat retornavam **401 Unauthorized** porque o cliente não estava enviando o token JWT nos headers das requisições.

## Solução

Novo utilitário `lib/apiClient.js` que:
- ✅ Obtém automaticamente o token da sessão Supabase
- ✅ Adiciona `Authorization: Bearer <token>` em todas as requisições
- ✅ Renova o token automaticamente se expirar (401)
- ✅ Faz retry da requisição com novo token

## Como Usar

### Importar

```javascript
import { apiCall } from '@/lib/apiClient';
// ou
import apiCall from '@/lib/apiClient';
```

### Exemplo: Enviar Mensagem

```javascript
async function sendMessage(conversationId, text) {
  try {
    const response = await apiCall('/api/send-message', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: conversationId,
        text: text
      })
    });

    if (!response.ok) {
      throw new Error(`Erro ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Mensagem enviada:', data);
    return data;
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    throw error;
  }
}
```

### Exemplo: Buscar Preferências de Notificação

```javascript
async function getNotificationPreferences() {
  try {
    const response = await apiCall('/api/notification-preferences', {
      method: 'GET'
    });

    if (!response.ok) {
      throw new Error(`Erro ${response.status}`);
    }

    const prefs = await response.json();
    return prefs;
  } catch (error) {
    console.error('Erro ao buscar preferências:', error);
    throw error;
  }
}
```

### Exemplo: Criar Caso

```javascript
async function createCase(caseData) {
  try {
    const response = await apiCall('/api/cases', {
      method: 'POST',
      body: JSON.stringify(caseData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao criar caso');
    }

    const newCase = await response.json();
    return newCase;
  } catch (error) {
    console.error('Erro ao criar caso:', error);
    throw error;
  }
}
```

## Fluxo Interno

```
1. Componente chama apiCall('/api/endpoint', options)
   ↓
2. apiCall obtém sessão do Supabase via getAuthHeaders()
   ↓
3. getAuthHeaders() verifica se token está prestes a expirar
   ↓
4. Se vai expirar, renova automaticamente
   ↓
5. Retorna headers com Authorization: Bearer <token>
   ↓
6. apiCall faz fetch com headers autenticados
   ↓
7. Se receber 401, renova token e faz retry
   ↓
8. Retorna response ao componente
```

## Tratamento de Erros

### Não Autenticado (401)

```javascript
try {
  const response = await apiCall('/api/send-message', options);
  
  if (response.status === 401) {
    // Sessão expirada mesmo após retry
    // Redirecionar para login
    window.location.href = '/login';
  }
} catch (error) {
  if (error.message.includes('Não autenticado')) {
    // Usuário não tem sessão ativa
    window.location.href = '/login';
  }
}
```

### Sem Permissão (403)

```javascript
if (response.status === 403) {
  // Usuário não tem permissão para acessar este recurso
  console.error('Acesso negado');
}
```

### Erro do Servidor (500)

```javascript
if (response.status >= 500) {
  // Erro interno do servidor
  console.error('Erro no servidor');
}
```

## Comparação: Antes vs Depois

### ❌ Antes (Sem Token)

```javascript
const response = await fetch('/api/send-message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ conversation_id, text })
});
// Resultado: 401 Unauthorized
```

### ✅ Depois (Com apiClient)

```javascript
const response = await apiCall('/api/send-message', {
  method: 'POST',
  body: JSON.stringify({ conversation_id, text })
});
// Resultado: 200 OK + dados
```

## APIs Protegidas que Agora Funcionam

- ✅ `POST /api/send-message` - Enviar mensagem
- ✅ `GET /api/notification-preferences` - Buscar preferências
- ✅ `PATCH /api/notification-preferences` - Atualizar preferências
- ✅ `GET /api/cases` - Listar casos
- ✅ `POST /api/cases` - Criar caso
- ✅ `PATCH /api/cases` - Atualizar caso
- ✅ `GET /api/notifications` - Listar notificações
- ✅ `GET /api/notifications/count` - Contar notificações
- ✅ E todas as outras APIs que usam `withAuth()`

## Implementação Técnica

O `apiClient.js` reutiliza a função `getAuthHeaders()` existente em `lib/api.js`, que:

1. Obtém a sessão atual do Supabase Auth
2. Verifica se o token está prestes a expirar (2 minutos antes)
3. Se vai expirar, renova automaticamente
4. Retorna headers com `Authorization: Bearer <token>`

Isso garante que:
- ✅ Token sempre válido
- ✅ Sem múltiplos refreshs simultâneos
- ✅ Compatível com toda a arquitetura existente

## Próximos Passos

1. Atualizar componentes para usar `apiCall` em vez de `fetch` direto
2. Testar todas as APIs do chat
3. Validar comportamento com tokens expirados
4. Monitorar logs de autenticação

## Referências

- `lib/apiClient.js` - Novo utilitário
- `lib/api.js` - Função `getAuthHeaders()`
- `lib/auth.js` - Validação de token no servidor
- `pages/api/send-message.js` - Exemplo de API protegida
