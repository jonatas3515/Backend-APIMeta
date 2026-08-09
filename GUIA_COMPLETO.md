# 🎯 Guia Completo: Sistema de Chat WhatsApp + Gemini + Supabase

## 📋 Resumo do Projeto

Você tem um **sistema completo** pronto para gerenciar conversas de WhatsApp com IA (Gemini) e um painel web para responder clientes manualmente.

### Arquitetura

```
Cliente WhatsApp
    ↓
Meta Webhook (POST /webhook)
    ↓
Backend Node.js/Express
    ├─→ Salva em Supabase (conversations + messages)
    ├─→ Se modo='bot': chama Gemini 2.5 Flash-Lite
    └─→ Envia resposta via WhatsApp Cloud API
    
Frontend Next.js (React)
    ├─→ Lista de conversas
    ├─→ Chat em tempo real (Supabase Realtime)
    └─→ Envio manual de mensagens
```

---

## 🚀 Passo a Passo: Configuração Completa

### PASSO 1: Criar Projeto no Supabase

1. Acesse [https://supabase.com](https://supabase.com)
2. Clique em **"New Project"**
3. Preencha:
   - **Organization**: crie uma ou use existente
   - **Project name**: `whatsapp-chat-advocacia`
   - **Database password**: salve em local seguro
   - **Region**: São Paulo (ou sua região)
4. Clique em **"Create new project"** e aguarde 2-3 minutos

### PASSO 2: Criar Tabelas no Supabase

1. No dashboard do Supabase, clique em **"SQL Editor"** (menu esquerdo)
2. Clique em **"New Query"**
3. Copie e cole este SQL:

```sql
-- Criar tabela conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_phone VARCHAR(20) NOT NULL UNIQUE,
  client_name VARCHAR(255),
  status VARCHAR(20) DEFAULT 'open',
  mode VARCHAR(20) DEFAULT 'bot',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction VARCHAR(20) NOT NULL,
  sender_type VARCHAR(20) NOT NULL,
  content_type VARCHAR(50) DEFAULT 'text',
  text TEXT,
  media_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Criar índices
CREATE INDEX idx_conversations_client_phone ON conversations(client_phone);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Criar tabela admin_users (opcional)
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

4. Clique em **"Run"** (ou Ctrl+Enter)
5. Aguarde a mensagem de sucesso

### PASSO 3: Obter Credenciais do Supabase

1. No dashboard, clique em **"Settings"** (ícone de engrenagem, canto inferior esquerdo)
2. Clique em **"API"**
3. Copie e salve em um arquivo seguro:

| Nome | Valor | Onde usar |
|------|-------|-----------|
| **Project URL** | `https://xxxxx.supabase.co` | `SUPABASE_URL` |
| **Service Role Secret** | `eyJhbGc...` | `SUPABASE_SERVICE_ROLE_KEY` |
| **Anon Public** | `eyJhbGc...` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

⚠️ **Guarde a Service Role Key com segurança!**

### PASSO 4: Configurar Variáveis de Ambiente na Vercel

1. Acesse [https://vercel.com/dashboard](https://vercel.com/dashboard)
2. Clique no projeto **backend-apimeta**
3. Clique em **"Settings"** (aba superior)
4. Clique em **"Environment Variables"** (menu lateral)
5. Adicione **todas** estas variáveis:

| Key | Value | Ambiente |
|-----|-------|----------|
| `WEBHOOK_VERIFY_TOKEN` | `seu-token-seguro-123` | Prod, Preview, Dev |
| `WHATSAPP_TOKEN` | `seu-token-whatsapp` | Prod, Preview, Dev |
| `WHATSAPP_PHONE_NUMBER_ID` | `1289520100904873` | Prod, Preview, Dev |
| `GOOGLE_AI_API_KEY` | `sua-chave-gemini` | Prod, Preview, Dev |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Prod, Preview, Dev |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGc...` | Prod, Preview, Dev |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` | Prod, Preview, Dev |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGc...` | Prod, Preview, Dev |

6. Clique em **"Save"** após cada uma
7. Vá em **"Deployments"**, selecione o último e clique em **"Redeploy"**

### PASSO 5: Acessar o Painel de Chat

Após o redeploy (5-10 minutos), acesse:

```
https://backend-apimeta.vercel.app
```

Você verá:
- **À esquerda**: lista de conversas (clientes)
- **À direita**: chat com mensagens
- **Botão no topo**: alternar entre "Modo Bot" e "Modo Humano"

---

## 📱 Como Funciona

### Fluxo 1: Cliente Envia Mensagem (WhatsApp → Backend → Supabase)

```
1. Cliente envia mensagem via WhatsApp
   ↓
2. Meta envia webhook para https://backend-apimeta.vercel.app/webhook
   ↓
3. Backend extrai número do cliente (from) e texto (text.body)
   ↓
4. Backend busca/cria conversa em Supabase (conversations)
   ↓
5. Backend registra mensagem em Supabase (messages)
   ↓
6. SE modo='bot':
   - Chama Gemini 2.5 Flash-Lite (com fallback 1.5)
   - Envia resposta via WhatsApp Cloud API
   - Registra resposta em Supabase
   
   SE modo='human':
   - Apenas registra a mensagem
   - Você vê no painel e responde manualmente
```

### Fluxo 2: Você Envia Resposta Manual (Frontend → Backend → WhatsApp)

```
1. Você digita resposta no painel de chat
   ↓
2. Clica em "Enviar"
   ↓
3. Frontend chama POST /api/send-message
   ↓
4. Backend envia via WhatsApp Cloud API
   ↓
5. Backend registra em Supabase (messages)
   ↓
6. Frontend atualiza em tempo real (Supabase Realtime)
```

### Fluxo 3: Alternar Modo (Bot ↔ Humano)

```
1. Você clica no botão "Modo Bot" ou "Modo Humano"
   ↓
2. Frontend chama PATCH /api/conversation/[id]/mode
   ↓
3. Backend atualiza coluna 'mode' em Supabase
   ↓
4. Próximas mensagens do cliente seguem o novo modo
```

---

## 🔧 Arquivos Principais

### Backend (Node.js/Express)

- **`api/webhook.js`** — webhook do WhatsApp, integração Gemini e Supabase
- **`lib/supabase.js`** — cliente Supabase server-side
- **`pages/api/send-message.js`** — rota para enviar mensagem manual
- **`pages/api/conversation/[id]/mode.js`** — rota para alterar modo

### Frontend (Next.js/React)

- **`pages/index.js`** — página principal (lista + chat)
- **`components/ChatList.js`** — lista de conversas
- **`components/ChatWindow.js`** — janela de chat
- **`lib/supabaseClient.js`** — cliente Supabase client-side

### Banco de Dados

- **`supabase/migrations/001_create_tables.sql`** — schema do banco

### Configuração

- **`package.json`** — dependências
- **`next.config.js`** — configuração Next.js
- **`tailwind.config.js`** — Tailwind CSS
- **`.env.example`** — exemplo de variáveis

---

## 🛠️ Troubleshooting

### Problema: "Variáveis de ambiente não configuradas"

**Causa**: Variáveis não foram adicionadas na Vercel ou o deploy não foi feito após adicionar.

**Solução**:
1. Verifique se todas as 8 variáveis estão em **Settings → Environment Variables**
2. Vá em **Deployments**, selecione o último e clique em **"Redeploy"**
3. Aguarde 5-10 minutos

### Problema: "Erro ao conectar Supabase"

**Causa**: `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` incorretos.

**Solução**:
1. Verifique os valores em Supabase → Settings → API
2. Copie novamente (sem espaços extras)
3. Atualize na Vercel e redeploy

### Problema: "Mensagem não aparece no chat"

**Causa**: Conversa não foi criada ou mensagem não foi salva.

**Solução**:
1. Acesse Supabase → SQL Editor
2. Execute:
   ```sql
   SELECT * FROM conversations;
   SELECT * FROM messages;
   ```
3. Verifique se os dados estão lá
4. Veja os logs da Vercel (Deployments → Logs)

### Problema: "WhatsApp não recebe resposta"

**Causa**: `WHATSAPP_TOKEN` ou `PHONE_NUMBER_ID` incorretos.

**Solução**:
1. Verifique os valores em Meta Developers
2. Teste o webhook manualmente (veja logs da Vercel)
3. Verifique se o número está registrado na Cloud API

### Problema: "Build falha na Vercel"

**Causa**: Dependências faltando ou erro de sintaxe.

**Solução**:
1. Verifique se `package.json` tem todas as dependências
2. Rode `npm install` localmente para testar
3. Veja os logs de build na Vercel (Deployments → Inspect)

---

## 📊 Estrutura de Dados

### Tabela: `conversations`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | ID único da conversa |
| `client_phone` | VARCHAR(20) | Número do cliente (ex: 5573999...) |
| `client_name` | VARCHAR(255) | Nome do cliente (opcional) |
| `status` | VARCHAR(20) | 'open' ou 'closed' |
| `mode` | VARCHAR(20) | 'bot' ou 'human' |
| `created_at` | TIMESTAMP | Data de criação |
| `updated_at` | TIMESTAMP | Última atualização |

### Tabela: `messages`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | ID único da mensagem |
| `conversation_id` | UUID | FK para conversations |
| `direction` | VARCHAR(20) | 'inbound' (cliente) ou 'outbound' (você/bot) |
| `sender_type` | VARCHAR(20) | 'client', 'bot' ou 'human' |
| `content_type` | VARCHAR(50) | 'text', 'audio', 'video', 'image', 'document' |
| `text` | TEXT | Conteúdo da mensagem (se texto) |
| `media_url` | TEXT | URL do arquivo (se mídia) |
| `created_at` | TIMESTAMP | Data/hora da mensagem |

---

## 🔐 Segurança

### Boas Práticas

1. **Nunca compartilhe `SUPABASE_SERVICE_ROLE_KEY`** — é a chave mestre do banco
2. **Use `NEXT_PUBLIC_SUPABASE_ANON_KEY` no frontend** — é pública e limitada
3. **Proteja `WHATSAPP_TOKEN`** — permite enviar mensagens
4. **Use HTTPS** — Vercel fornece automaticamente

### Próximos Passos (Opcional)

- Adicionar autenticação (login/senha) para o painel
- Implementar Row Level Security (RLS) no Supabase
- Adicionar rate limiting nas rotas de API
- Criptografar dados sensíveis

---

## 📞 Suporte

Se tiver dúvidas:

1. **Verifique os logs** da Vercel (Deployments → Logs)
2. **Verifique o SQL Editor** do Supabase (dados estão sendo salvos?)
3. **Teste o webhook** manualmente (envie mensagem do WhatsApp)
4. **Veja o console do navegador** (F12 → Console) para erros JavaScript

---

## ✅ Checklist Final

- [ ] Projeto criado no Supabase
- [ ] Tabelas criadas no Supabase (SQL executado)
- [ ] Credenciais do Supabase copiadas
- [ ] Variáveis de ambiente adicionadas na Vercel (8 variáveis)
- [ ] Redeploy feito na Vercel
- [ ] Painel acessível em `https://backend-apimeta.vercel.app`
- [ ] Webhook configurado no painel da Meta
- [ ] Primeira mensagem de teste enviada via WhatsApp
- [ ] Mensagem apareceu no painel de chat
- [ ] Resposta manual enviada com sucesso

---

**Pronto! Seu sistema de chat está funcionando.** 🎉
