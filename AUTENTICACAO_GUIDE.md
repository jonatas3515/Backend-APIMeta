# 🔐 Guia de Autenticação - Supabase Auth

## Visão Geral

O sistema Neves & Costa Chat utiliza **Supabase Auth** para autenticação robusta com integração de roles (papéis) e hierarquia de acesso. Este guia descreve como usar o sistema de autenticação.

---

## 1. Hierarquia de Roles

O sistema possui 3 níveis de acesso:

### 👑 Admin (Nível 3)
- **Acesso:** Completo ao sistema
- **Permissões:**
  - Criar, editar e desativar usuários (todos os roles)
  - Acessar gestão de LGPD
  - Visualizar auditoria completa
  - Gerenciar templates e rotinas
  - Acessar todas as conversas e casos
- **Email padrão:** `jonatascosta.adv@gmail.com`

### ⚖️ Advogado (Nível 2)
- **Acesso:** Gerenciamento de casos e estagiários
- **Permissões:**
  - Criar, editar e desativar estagiários
  - Acessar conversas e casos
  - Visualizar métricas de demanda
  - Gerenciar templates e rotinas
  - Atribuir conversas/casos

### 🎓 Estagiário (Nível 1)
- **Acesso:** Atendimento básico
- **Permissões:**
  - Visualizar conversas atribuídas
  - Responder mensagens
  - Visualizar casos
  - Acessar templates
  - Sem acesso a LGPD ou gestão de usuários

---

## 2. Login

### Tela de Login
1. Acesse a aplicação
2. Insira **email** e **senha**
3. Clique em "Entrar"

### Credenciais Iniciais
- **Email:** `jonatascosta.adv@gmail.com`
- **Senha:** Fornecida durante setup (via `/api/auth/setup-admin`)

### Fluxo de Autenticação
```
1. Usuário insere email/senha
2. Sistema valida no Supabase Auth
3. Retorna JWT token
4. Frontend armazena token em sessão
5. Token enviado em todas as requisições à API
6. Backend verifica token e role
7. Acesso concedido/negado
```

---

## 3. Gestão de Usuários

### Acessar Gestão de Usuários
1. Login como **Admin**
2. Clique na aba **⚙️ Gestão de Usuários** (sidebar)
3. Visualize lista de usuários

### Criar Novo Usuário

#### Como Admin:
1. Clique em **+ Novo Usuário**
2. Preencha:
   - **Nome:** Nome completo
   - **Email:** Email único
   - **Papel:** Admin, Advogado ou Estagiário
   - **Senha inicial:** Senha temporária
3. Clique em **Criar Usuário**
4. Usuário recebe email com instruções

#### Como Advogado:
1. Clique em **+ Novo Usuário**
2. Preencha:
   - **Nome:** Nome completo
   - **Email:** Email único
   - **Papel:** Apenas "Estagiário"
   - **Senha inicial:** Senha temporária
3. Clique em **Criar Usuário**

### Desativar/Ativar Usuário
1. Localize o usuário na tabela
2. Clique em **Desativar** (se ativo) ou **Ativar** (se inativo)
3. Usuário inativo não consegue fazer login

### Editar Usuário
- Clique no nome do usuário para editar
- Altere nome, email ou papel
- Clique em **Salvar**

---

## 4. Logout

### Como fazer logout:
1. Clique em **👤 Perfil** (canto superior direito)
2. Clique em **Sair**
3. Sessão encerrada
4. Redirecionado para tela de login

---

## 5. Proteção de Rotas

### Frontend
Todas as rotas são protegidas por role:

```javascript
// Exemplo: Apenas admin pode acessar
{
  role: 'admin',
  component: <UserManagement />
}

// Exemplo: Admin e Advogado podem acessar
{
  minRole: 'advogado',
  component: <MetricsDashboard />
}

// Exemplo: Todos podem acessar
{
  minRole: 'estagiario',
  component: <ChatWindow />
}
```

### Backend
Todos os endpoints verificam token e role:

```javascript
// Exemplo: Apenas admin
export default withAuth(handler, { allowedRoles: ['admin'] });

// Exemplo: Admin e Advogado
export default withAuth(handler, { minRole: 'advogado' });

// Exemplo: Todos autenticados
export default withAuth(handler, { minRole: 'estagiario' });
```

---

## 6. APIs de Autenticação

### POST /api/auth/login
Realiza login com email/senha

**Request:**
```json
{
  "email": "usuario@example.com",
  "password": "senha123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "usuario@example.com",
    "name": "Nome do Usuário",
    "role": "advogado"
  },
  "access_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### GET /api/auth/users
Lista usuários (com filtro por role do solicitante)

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Jonatas Costa",
    "email": "jonatas@example.com",
    "role": "admin",
    "is_active": true
  }
]
```

### POST /api/auth/users
Cria novo usuário

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request:**
```json
{
  "name": "Novo Usuário",
  "email": "novo@example.com",
  "role": "estagiario",
  "password": "senha123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "novo@example.com",
    "role": "estagiario"
  }
}
```

### PATCH /api/auth/users
Atualiza usuário (desativar/ativar)

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request:**
```json
{
  "id": "uuid",
  "is_active": false
}
```

### POST /api/auth/setup-admin
Cria usuário admin inicial (apenas primeira vez)

**Request:**
```json
{
  "setup_key": "ADMIN_SETUP_KEY",
  "email": "admin@example.com",
  "password": "senha123"
}
```

---

## 7. Segurança

### Boas Práticas

✅ **Senhas:**
- Mínimo 8 caracteres
- Altere senha periodicamente
- Não compartilhe senha

✅ **Tokens:**
- Tokens JWT com expiração de 1 hora
- Renovados automaticamente
- Nunca compartilhe token

✅ **Auditoria:**
- Todas as ações registradas em `audit_logs`
- Rastreamento: quem fez o quê, quando
- Histórico completo de mudanças

✅ **Confidencialidade:**
- Estagiários não veem dados confidenciais
- Advogados veem apenas seus estagiários
- Admin vê tudo

### Endpoints Protegidos

| Endpoint | Admin | Advogado | Estagiário |
|----------|-------|----------|-----------|
| `/api/auth/users` | ✅ | ❌ | ❌ |
| `/api/cases` | ✅ | ✅ | ✅ |
| `/api/collaboration` | ✅ | ✅ | ✅ |
| `/api/lgpd` | ✅ | ❌ | ❌ |
| `/api/metrics` | ✅ | ✅ | ❌ |
| `/api/send-message` | ✅ | ✅ | ✅ |
| `/api/templates` | ✅ | ✅ | ✅ |
| `/api/routines` | ✅ | ✅ | ✅ |
| `/api/agenda` | ✅ | ✅ | ✅ |
| `/api/insights` | ✅ | ✅ | ✅ |
| `/api/client-info` | ✅ | ✅ | ✅ |

---

## 8. Troubleshooting

### "Token inválido ou expirado"
- **Causa:** Token expirou ou é inválido
- **Solução:** Faça logout e login novamente

### "Acesso negado"
- **Causa:** Seu role não tem permissão
- **Solução:** Contate um admin para elevar seu acesso

### "Usuário não encontrado"
- **Causa:** Email não existe no sistema
- **Solução:** Verifique email ou solicite criação de conta

### "Senha incorreta"
- **Causa:** Senha digitada está errada
- **Solução:** Tente novamente ou clique "Esqueci minha senha"

### "Email já existe"
- **Causa:** Email já foi cadastrado
- **Solução:** Use outro email ou contate admin para recuperar conta

---

## 9. Fluxo Completo de Exemplo

### Cenário: Criar novo estagiário

1. **Admin faz login**
   - Email: `jonatas@example.com`
   - Senha: `senha123`

2. **Admin acessa Gestão de Usuários**
   - Clica em ⚙️ Gestão de Usuários

3. **Admin cria novo estagiário**
   - Clica em + Novo Usuário
   - Nome: "João Silva"
   - Email: "joao@example.com"
   - Papel: Estagiário
   - Senha: "temp123"
   - Clica em Criar Usuário

4. **Sistema registra em audit_logs**
   - Ação: "create"
   - Usuário: "jonatas@example.com"
   - Novo usuário: "joao@example.com"
   - Role: "estagiario"

5. **Novo estagiário faz login**
   - Email: "joao@example.com"
   - Senha: "temp123"
   - Sistema valida no Supabase Auth
   - Retorna token JWT

6. **Estagiário acessa sistema**
   - Pode visualizar conversas
   - Pode responder mensagens
   - Não pode acessar LGPD
   - Não pode gerenciar usuários

---

## 10. Próximos Passos

- [ ] Implementar recuperação de senha
- [ ] Adicionar autenticação 2FA
- [ ] Integrar SSO (Google, Microsoft)
- [ ] Criar dashboard de auditoria
- [ ] Implementar rate limiting

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Consulte este guia
2. Verifique logs em `/api/collaboration?action=audit`
3. Contate o administrador do sistema

---

**Versão:** 1.0  
**Última atualização:** Agosto 2026  
**Status:** ✅ Produção
