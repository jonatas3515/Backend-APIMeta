# 🧪 Teste do apiClient.js

## Teste Rápido no Console

### 1. Abrir Console do Navegador
- Pressione `F12` ou `Ctrl+Shift+I`
- Vá para a aba **Console**

### 2. Copiar e Colar

```javascript
// Teste 1: Buscar contagem de notificações
import apiCall from '/lib/apiClient.js';

const response = await apiCall('/api/notifications/count');
const data = await response.json();
console.log('Notificações:', data);
```

**Resultado esperado:**
```json
{
  "unreadCount": 5,
  "countReliable": true,
  "errors": []
}
```

---

## Testes Detalhados

### Teste 2: Buscar Preferências de Notificação

```javascript
import apiCall from '/lib/apiClient.js';

const response = await apiCall('/api/notification-preferences', {
  method: 'GET'
});

if (response.ok) {
  const prefs = await response.json();
  console.log('✅ Preferências:', prefs);
} else {
  console.error('❌ Erro:', response.status, response.statusText);
}
```

**Resultado esperado:**
```json
{
  "enabled": true,
  "notify_messages": true,
  "notify_deadlines": true,
  "notify_assignments": true,
  "notify_reminders": true,
  "notify_checklist": false,
  "silent_start": null,
  "silent_end": null
}
```

---

### Teste 3: Listar Casos

```javascript
import apiCall from '/lib/apiClient.js';

const response = await apiCall('/api/cases', {
  method: 'GET'
});

if (response.ok) {
  const cases = await response.json();
  console.log('✅ Casos:', cases);
  console.log(`Total: ${cases.length} casos`);
} else {
  console.error('❌ Erro:', response.status);
}
```

**Resultado esperado:**
```json
[
  {
    "id": "case-123",
    "title": "Licença Prêmio",
    "legal_area": "Direito Trabalhista",
    "status": "ação",
    ...
  },
  ...
]
```

---

### Teste 4: Atualizar Preferências

```javascript
import apiCall from '/lib/apiClient.js';

const response = await apiCall('/api/notification-preferences', {
  method: 'PATCH',
  body: JSON.stringify({
    notify_messages: false,
    silent_start: '22:00',
    silent_end: '08:00'
  })
});

if (response.ok) {
  const updated = await response.json();
  console.log('✅ Atualizado:', updated);
} else {
  console.error('❌ Erro:', response.status);
}
```

---

## Teste de Erro 401 (Simulado)

### Teste 5: Verificar Renovação de Token

```javascript
import apiCall from '/lib/apiClient.js';

// Fazer múltiplas requisições para testar renovação
for (let i = 0; i < 3; i++) {
  console.log(`Requisição ${i + 1}...`);
  const response = await apiCall('/api/notifications/count');
  const data = await response.json();
  console.log(`✅ Resposta ${i + 1}:`, data.unreadCount);
  
  // Aguardar 1 segundo entre requisições
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

**Resultado esperado:** Todas as 3 requisições retornam 200 OK

---

## Teste de Erro 403 (Sem Permissão)

### Teste 6: Tentar Criar Caso como Estagiário

```javascript
import apiCall from '/lib/apiClient.js';

const response = await apiCall('/api/cases', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Novo Caso',
    legal_area: 'Direito Civil'
  })
});

if (response.status === 403) {
  const error = await response.json();
  console.log('✅ Erro esperado (403):', error.error);
} else if (response.ok) {
  console.log('✅ Caso criado (você é advogado/admin)');
} else {
  console.error('❌ Erro inesperado:', response.status);
}
```

---

## Teste Completo (Script)

Salve como `test-api-client.js` e execute:

```javascript
import apiCall from '@/lib/apiClient';

async function runTests() {
  console.log('🧪 Iniciando testes do apiClient...\n');

  // Teste 1: Notificações
  console.log('📊 Teste 1: Buscar contagem de notificações');
  try {
    const response = await apiCall('/api/notifications/count');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ PASSOU:', data);
    } else {
      console.error('❌ FALHOU:', response.status);
    }
  } catch (err) {
    console.error('❌ ERRO:', err.message);
  }

  // Teste 2: Preferências
  console.log('\n📋 Teste 2: Buscar preferências de notificação');
  try {
    const response = await apiCall('/api/notification-preferences');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ PASSOU:', data.enabled ? 'Habilitado' : 'Desabilitado');
    } else {
      console.error('❌ FALHOU:', response.status);
    }
  } catch (err) {
    console.error('❌ ERRO:', err.message);
  }

  // Teste 3: Casos
  console.log('\n⚖️ Teste 3: Listar casos');
  try {
    const response = await apiCall('/api/cases');
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ PASSOU: ${data.length} casos encontrados`);
    } else {
      console.error('❌ FALHOU:', response.status);
    }
  } catch (err) {
    console.error('❌ ERRO:', err.message);
  }

  console.log('\n✅ Testes concluídos!');
}

// Executar
runTests();
```

---

## Checklist de Validação

- [ ] Teste 1: Notificações retorna 200 OK
- [ ] Teste 2: Preferências retorna 200 OK
- [ ] Teste 3: Casos retorna 200 OK
- [ ] Teste 4: Atualizar preferências retorna 200 OK
- [ ] Teste 5: Múltiplas requisições funcionam
- [ ] Teste 6: Erro 403 é tratado corretamente
- [ ] Nenhum erro 401 é retornado
- [ ] Token é renovado automaticamente

---

## Solução de Problemas

### Erro: "Não autenticado"

```
❌ Erro: Não autenticado
```

**Causa:** Usuário não está logado

**Solução:** Faça login primeiro

```javascript
// Verificar se está autenticado
const { data: { user } } = await supabase.auth.getUser();
console.log('Usuário:', user?.email);
```

---

### Erro: "Sessão expirada"

```
❌ Erro: Sessão expirada
```

**Causa:** Token expirou e não pode ser renovado

**Solução:** Faça login novamente

```javascript
// Renovar sessão manualmente
const { data, error } = await supabase.auth.refreshSession();
if (error) {
  // Redirecionar para login
  window.location.href = '/login';
}
```

---

### Erro: 401 Unauthorized

```
❌ Erro 401: Unauthorized
```

**Causa:** Token inválido ou expirado

**Solução:** Verifique se `apiCall` está sendo usado

```javascript
// ❌ Errado
const response = await fetch('/api/send-message', { ... });

// ✅ Correto
const response = await apiCall('/api/send-message', { ... });
```

---

### Erro: 403 Forbidden

```
❌ Erro 403: Forbidden
```

**Causa:** Usuário não tem permissão

**Solução:** Verifique o role do usuário

```javascript
// Verificar role
const { data: { user } } = await supabase.auth.getUser();
const { data: profile } = await supabase
  .from('users')
  .select('role')
  .eq('auth_user_id', user.id)
  .single();

console.log('Role:', profile.role); // admin, advogado, estagiario
```

---

## Logs Esperados

Ao fazer requisições, você deve ver logs como:

```
[API] Token expirado, tentando renovar...
[API] Erro na requisição: ...
```

Se ver esses logs, significa que o `apiClient` está funcionando corretamente.

---

## Conclusão

Se todos os testes passarem, o `apiClient` está funcionando perfeitamente! ✅

**Próximo passo:** Migrar componentes para usar `apiCall` em vez de `fetch` direto.
