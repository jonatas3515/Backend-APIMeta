# Guia Completo: Configuração Supabase + Deploy Vercel

## 1. Criar Projeto no Supabase

1. Acesse [https://supabase.com](https://supabase.com) e faça login.
2. Clique em **"New Project"**.
3. Escolha uma organização (ou crie uma).
4. Dê um nome ao projeto, ex: `whatsapp-chat-advocacia`.
5. Escolha uma região (recomendado: América do Sul - São Paulo).
6. Defina uma senha para o banco de dados (salve em local seguro).
7. Clique em **"Create new project"** e aguarde a criação (pode levar 2-3 minutos).

## 2. Criar Tabelas no Supabase

1. No dashboard do Supabase, clique em **"SQL Editor"** (menu lateral esquerdo).
2. Clique em **"New Query"**.
3. Copie e cole todo o conteúdo do arquivo `supabase/migrations/001_create_tables.sql`.
4. Clique em **"Run"** (ou Ctrl+Enter).
5. Aguarde a execução. Você verá uma mensagem de sucesso.

## 3. Obter Credenciais do Supabase

1. No dashboard, clique em **"Settings"** (ícone de engrenagem, canto inferior esquerdo).
2. Clique em **"API"**.
3. Copie os seguintes valores:
   - **Project URL** → `SUPABASE_URL`
   - **Service Role Secret** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ guarde com segurança)
   - **Anon Public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Salve esses valores em um arquivo seguro. Você vai precisar deles para a Vercel.

## 4. Configurar Variáveis de Ambiente na Vercel

1. Acesse [https://vercel.com/dashboard](https://vercel.com/dashboard).
2. Clique no projeto **backend-apimeta**.
3. Clique em **"Settings"** (aba superior).
4. No menu lateral, clique em **"Environment Variables"**.
5. Adicione as seguintes variáveis:

| Key | Value | Ambiente |
|-----|-------|----------|
| `SUPABASE_URL` | URL do Supabase | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Supabase | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon Public Key | Production, Preview, Development |

6. Clique em **"Save"** após adicionar cada uma.
7. Vá em **"Deployments"**, selecione o último deploy e clique em **"Redeploy"**.

## 5. Estrutura de Pastas do Projeto

```
Backend API Meta/
├── api/
│   └── webhook.js          (webhook do WhatsApp + integração Supabase)
├── lib/
│   ├── supabase.js         (cliente Supabase server-side)
│   └── supabaseClient.js   (cliente Supabase client-side)
├── pages/
│   ├── _app.js             (app principal Next.js)
│   ├── index.js            (página de chat)
│   └── api/
│       ├── send-message.js (rota para enviar mensagem)
│       └── conversation/[id]/mode.js (rota para alterar modo)
├── components/
│   ├── ChatList.js         (lista de conversas)
│   └── ChatWindow.js       (janela de chat)
├── styles/
│   └── globals.css         (estilos globais)
├── supabase/
│   └── migrations/
│       └── 001_create_tables.sql (schema do banco)
├── package.json
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
└── .env.example
```

## 6. Fluxo de Funcionamento

### Recebimento de Mensagem (WhatsApp → Backend)

1. Cliente envia mensagem via WhatsApp.
2. Meta envia webhook para `https://backend-apimeta.vercel.app/api/webhook`.
3. Backend extrai `from` (número do cliente) e `text.body` (mensagem).
4. Backend busca/cria conversa em `conversations` pelo `client_phone`.
5. Backend registra mensagem em `messages` com `direction='inbound'` e `sender_type='client'`.
6. **Se modo = 'bot':**
   - Backend chama `askGemini()` (Gemini 2.5 Flash-Lite com fallback 3.1 Flash-Lite).
   - Backend envia resposta via WhatsApp Cloud API.
   - Backend registra resposta em `messages` com `sender_type='bot'`.
7. **Se modo = 'human':**
   - Backend apenas registra a mensagem.
   - Você vê no painel de chat e responde manualmente.

### Envio de Mensagem Manual (Frontend → Backend → WhatsApp)

1. Você digita uma resposta no chat web.
2. Frontend chama `POST /api/send-message` com `conversation_id` e `text`.
3. Backend busca `client_phone` da conversa.
4. Backend envia mensagem via WhatsApp Cloud API.
5. Backend registra mensagem em `messages` com `sender_type='human'`.
6. Frontend atualiza em tempo real (Supabase realtime).

### Alteração de Modo (Bot ↔ Humano)

1. Você clica no botão "Modo Bot" ou "Modo Humano" no chat.
2. Frontend chama `PATCH /api/conversation/[id]/mode` com novo `mode`.
3. Backend atualiza a coluna `mode` na tabela `conversations`.
4. Próximas mensagens do cliente seguem o novo modo.

## 7. Acessar o Painel de Chat

1. Após o redeploy, acesse: `https://backend-apimeta.vercel.app`
2. Você verá a lista de conversas à esquerda.
3. Clique em uma conversa para abrir o chat.
4. Veja as mensagens do cliente e respostas do bot.
5. Digite sua resposta e clique em "Enviar" para responder manualmente.
6. Use o botão "Modo Bot" / "Modo Humano" para alternar.

## 8. Monitorar Logs

### Logs do Backend (Webhook)

1. Acesse [https://vercel.com/dashboard](https://vercel.com/dashboard).
2. Clique no projeto **backend-apimeta**.
3. Clique em **"Logs"** (aba superior).
4. Você verá logs em tempo real do webhook, incluindo:
   - Mensagens recebidas
   - Respostas da IA
   - Erros de API

### Logs do Frontend (Chat Web)

1. Abra o navegador (F12 ou Ctrl+Shift+I).
2. Vá em **"Console"** para ver erros JavaScript.
3. Vá em **"Network"** para ver requisições HTTP.

## 9. Troubleshooting

### Problema: "Variáveis de ambiente não configuradas"

**Solução:** Verifique se todas as variáveis foram adicionadas na Vercel e se o deploy foi feito após adicionar.

### Problema: "Erro ao conectar Supabase"

**Solução:** Verifique se `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão corretos e se as tabelas foram criadas.

### Problema: "Mensagem não aparece no chat"

**Solução:** Verifique se a conversa foi criada em `conversations` e se a mensagem foi inserida em `messages`. Use o SQL Editor do Supabase para debugar.

### Problema: "WhatsApp não recebe resposta"

**Solução:** Verifique se `WHATSAPP_TOKEN` e `PHONE_NUMBER_ID` estão corretos. Veja os logs da Vercel para erros de API.

## 10. Próximos Passos (Opcional)

- Adicionar autenticação (login/senha) para o painel de chat.
- Suportar anexos (áudios, vídeos, imagens, PDFs).
- Adicionar histórico de conversas arquivadas.
- Integrar com CRM ou sistema de tickets.
