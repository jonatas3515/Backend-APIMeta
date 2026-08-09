# ✅ Guia Seguro: Adicionar Chat ao Supabase Existente

## 📋 Checklist de Segurança PRÉ-EXECUÇÃO

Antes de rodar o SQL, **confirme cada item**:

- [ ] Você está no projeto Supabase correto (seu site de advocacia)
- [ ] Você fez um **backup** do banco (Supabase → Settings → Backups)
- [ ] Nenhuma tabela com esses nomes já existe:
  - `conversations`
  - `messages`
  - `admin_users`
- [ ] Você tem acesso de **escrita** ao SQL Editor
- [ ] Você está em horário de **baixo uso** do site (para evitar locks)

## 🚀 Passo a Passo: Executar a Migration

### 1. Acessar SQL Editor do Supabase

1. Acesse [https://supabase.com](https://supabase.com) e faça login
2. Clique no seu projeto (site de advocacia)
3. No menu lateral esquerdo, clique em **"SQL Editor"**
4. Clique em **"New Query"**

### 2. Copiar e Colar o SQL

1. Abra o arquivo: `supabase/migrations/002_add_chat_tables.sql`
2. Copie **TODO** o conteúdo
3. Cole no SQL Editor da Vercel
4. Você verá o SQL com syntax highlighting

### 3. Executar a Migration

1. Clique em **"Run"** (ou pressione Ctrl+Enter)
2. Aguarde a execução (deve levar menos de 5 segundos)
3. Você verá uma mensagem de sucesso:
   ```
   Query executed successfully
   ```

### 4. Verificar se Funcionou

1. No menu lateral, clique em **"Table Editor"**
2. Você deve ver 3 novas tabelas:
   - `conversations`
   - `messages`
   - `admin_users`
3. Clique em cada uma para confirmar que os campos estão corretos

## 📊 O que foi criado

### Tabela: `conversations`

Armazena conversas com clientes do WhatsApp.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | ID único (gerado automaticamente) |
| `client_phone` | VARCHAR(20) | Número do cliente (ex: 5573999...) |
| `client_name` | VARCHAR(255) | Nome do cliente (opcional) |
| `status` | VARCHAR(20) | 'open' ou 'closed' |
| `mode` | VARCHAR(20) | 'bot' ou 'human' |
| `created_at` | TIMESTAMP | Data de criação |
| `updated_at` | TIMESTAMP | Última atualização (automática) |

**Índices criados**:
- `idx_conversations_client_phone` — buscar por número
- `idx_conversations_status` — filtrar por status
- `idx_conversations_mode` — filtrar por modo
- `idx_conversations_updated_at` — ordenar por data

### Tabela: `messages`

Armazena todas as mensagens do chat.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | ID único |
| `conversation_id` | UUID | FK para conversations |
| `direction` | VARCHAR(20) | 'inbound' (cliente) ou 'outbound' (você/bot) |
| `sender_type` | VARCHAR(20) | 'client', 'bot' ou 'human' |
| `content_type` | VARCHAR(50) | 'text', 'audio', 'video', 'image', 'document' |
| `text` | TEXT | Conteúdo da mensagem (se texto) |
| `media_url` | TEXT | URL do arquivo (se mídia) |
| `created_at` | TIMESTAMP | Data/hora da mensagem |

**Índices criados**:
- `idx_messages_conversation_id` — buscar mensagens de uma conversa
- `idx_messages_created_at` — ordenar por data
- `idx_messages_sender_type` — filtrar por tipo de remetente
- `idx_messages_direction` — filtrar por direção
- `idx_messages_conversation_created` — buscar e ordenar juntos

### Tabela: `admin_users` (Opcional)

Para autenticação futura do painel de admin.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | ID único |
| `email` | VARCHAR(255) | Email do admin (único) |
| `password_hash` | VARCHAR(255) | Hash da senha (bcrypt) |
| `is_active` | BOOLEAN | Se o admin está ativo |
| `created_at` | TIMESTAMP | Data de criação |
| `updated_at` | TIMESTAMP | Última atualização (automática) |

**Índices criados**:
- `idx_admin_users_email` — buscar por email
- `idx_admin_users_is_active` — filtrar ativos

## 🔒 Segurança

### O que foi feito para ser seguro

✅ **Sem DROP TABLE** — nenhuma tabela existente foi deletada  
✅ **Sem ALTER TABLE** — nenhuma tabela existente foi modificada  
✅ **IF NOT EXISTS** — se a tabela já existir, não dá erro  
✅ **CHECK constraints** — apenas valores válidos são aceitos  
✅ **UNIQUE constraints** — evita duplicatas (ex: um cliente por número)  
✅ **Foreign Keys** — garante integridade referencial  
✅ **ON DELETE CASCADE** — se deletar conversa, deleta mensagens automaticamente  
✅ **Índices únicos** — nomes não colidem com tabelas existentes  
✅ **Triggers automáticos** — `updated_at` atualiza sozinho  

### Boas práticas aplicadas

1. **Timestamps com timezone** — `TIMESTAMP WITH TIME ZONE` para evitar confusão
2. **UUIDs** — melhor que IDs sequenciais para distribuído
3. **Índices estratégicos** — para queries rápidas
4. **Constraints de valor** — `CHECK` garante dados válidos

## 🆘 Troubleshooting

### Problema: "Table already exists"

**Causa**: Uma das tabelas já existe no seu banco.

**Solução**:
1. Verifique em **Table Editor** qual tabela já existe
2. Se for a tabela de chat, pode ignorar (já está pronta)
3. Se for outra tabela com nome igual, renomeie a migration

### Problema: "Foreign key constraint failed"

**Causa**: Tentou deletar uma conversa que tem mensagens.

**Solução**: Isso é esperado! A constraint `ON DELETE CASCADE` garante que ao deletar uma conversa, todas as mensagens são deletadas automaticamente.

### Problema: "Permission denied"

**Causa**: Seu usuário não tem permissão de escrita.

**Solução**:
1. Verifique em Supabase → Settings → Database → Users
2. Seu usuário deve ter role `postgres` ou `authenticated` com permissões

### Problema: "Syntax error"

**Causa**: SQL foi copiado incorretamente.

**Solução**:
1. Copie novamente do arquivo `002_add_chat_tables.sql`
2. Certifique-se de copiar o arquivo **inteiro**
3. Cole no SQL Editor e execute

## ✅ Verificação Pós-Execução

Após rodar o SQL, execute estes comandos para confirmar:

### Verificar tabelas criadas

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('conversations', 'messages', 'admin_users');
```

Resultado esperado: 3 linhas (conversations, messages, admin_users)

### Verificar índices criados

```sql
SELECT indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('conversations', 'messages', 'admin_users');
```

Resultado esperado: 11 índices

### Verificar triggers criados

```sql
SELECT trigger_name 
FROM information_schema.triggers 
WHERE trigger_schema = 'public';
```

Resultado esperado: 2 triggers (trigger_conversations_updated_at, trigger_admin_users_updated_at)

## 📝 Próximos Passos

1. **Configurar variáveis de ambiente** na Vercel (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.)
2. **Redeploy** na Vercel
3. **Acessar** `https://backend-apimeta.vercel.app`
4. **Testar** enviando uma mensagem via WhatsApp

## 🎯 Resumo

| Item | Status |
|------|--------|
| Tabelas criadas | ✅ 3 (conversations, messages, admin_users) |
| Índices criados | ✅ 11 |
| Triggers criados | ✅ 2 |
| Tabelas existentes alteradas | ❌ Nenhuma |
| Dados existentes afetados | ❌ Nenhum |
| Segurança | ✅ Máxima |

**Seu banco está seguro e pronto para o chat!** 🎉
