# WhatsApp Cloud API + Google AI Studio (Gemini) na Vercel

Este projeto é um backend serverless feito em Node.js + Express para integrar a **WhatsApp Cloud API** da Meta com o **Google AI Studio (Gemini)**.

## Arquivos principais

- `api/webhook.js` — rota `/webhook` que verifica e recebe eventos do WhatsApp.
- `vercel.json` — configuração de rotas da Vercel.
- `package.json` — dependências e scripts.
- `.env.example` — exemplo das variáveis de ambiente.

## Variáveis de ambiente

Configure todas na Vercel:

| Variável | Descrição | Onde conseguir |
|----------|-----------|----------------|
| `WEBHOOK_VERIFY_TOKEN` | Token que você mesmo inventa, usado pelo painel da Meta para validar o webhook. | Crie um valor forte, ex: `meu-token-seguro-123` |
| `WHATSAPP_TOKEN` | Token de acesso permanente da API do WhatsApp. | Meta Developers → WhatsApp → Configuration → Access Tokens |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número de telefone registrado na Cloud API. | Meta Developers → WhatsApp API Setup → ver o número do telefone |
| `GOOGLE_AI_API_KEY` | Chave da API do Google AI Studio (Gemini). | Google AI Studio → Get API key |

## Como fazer deploy na Vercel (passo a passo)

### 1. Criar uma conta e projeto

1. Acesse [https://vercel.com](https://vercel.com).
2. Clique em **“Add New...”** → **“Project”**.
3. Importe o repositório Git onde você subiu este código (GitHub, GitLab ou Bitbucket).
   - Se ainda não subiu, crie um repositório no GitHub e faça `git push` desta pasta.
4. Dê um nome ao projeto, ex: `whatsapp-gemini-bot`.
5. Clique em **“Deploy”**.

### 2. Configurar variáveis de ambiente na Vercel

1. No dashboard do projeto Vercel, clique em **“Settings”** (aba superior).
2. No menu lateral, clique em **“Environment Variables”**.
3. Para cada variável da tabela acima, clique em **“Add”**:
   - **Key**: nome da variável (ex: `WEBHOOK_VERIFY_TOKEN`).
   - **Value**: o valor correspondente.
   - **Environment**: deixe marcado `Production`, `Preview` e `Development`.
4. Clique em **“Save”**.
5. Após adicionar todas, faça um novo deploy clicando em **“Deployments”** → selecione o último → **“Redeploy”**.

### 3. Descobrir a URL final do webhook

A URL será:

```
https://NOME-DO-PROJETO.vercel.app/webhook
```

Exemplo:

```
https://whatsapp-gemini-bot.vercel.app/webhook
```

Você encontra o domínio exato em **Vercel Dashboard → seu projeto → Domains**.

## Configurar o webhook no painel da Meta Developers

1. Acesse [https://developers.facebook.com](https://developers.facebook.com).
2. Vá até seu app → **WhatsApp → Configuration** (ou **API Setup**).
3. Procure a seção **“Webhook”**.
4. Em **“Callback URL”**, cole a URL do seu projeto Vercel seguida de `/webhook`. Exemplo:

   ```
   https://whatsapp-gemini-bot.vercel.app/webhook
   ```

5. Em **“Verify token”**, cole o mesmo valor da variável `WEBHOOK_VERIFY_TOKEN`.
6. Clique em **“Verify and save”**.
7. Depois, na seção **“Webhook fields”**, clique em **“Manage”** e marque a opção **“messages”** para receber mensagens.

## Como testar

1. Envie uma mensagem de texto do seu WhatsApp pessoal para o número de telefone configurado na Cloud API.
2. A Meta enviará o evento para seu webhook na Vercel.
3. No dashboard da Vercel, vá em **“Logs”** da função `/api/webhook` para ver:
   - O número do remetente.
   - O texto recebido.
   - A resposta gerada pelo Gemini.
   - Confirmação de envio da resposta ao usuário.

## Rodar localmente (opcional)

Crie um arquivo `.env` com as variáveis e execute:

```bash
npm install
node api/webhook.js
```

Acesse localmente: `http://localhost:3000/webhook`
