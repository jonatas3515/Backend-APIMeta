# Integração com Calendários Externos

Guia para configurar a sincronização da Agenda Jurídica com Google Calendar e Outlook (Microsoft 365).

## Funcionalidades implementadas

### Fase 1 (já disponível)

- **Tabela `user_calendar_integrations`** no Supabase.
- **Token iCal por usuário**: assine a agenda em qualquer aplicativo de calendário sem precisar de OAuth.
- **Endpoint `/api/calendar-sync/ical?token=<uuid>`**: feed `.ics` com prazos, lembretes e eventos dos próximos 90 dias.
- **Rotas de integração OAuth (esqueleto)**: `/api/calendar-integrations/connect`, `/callback`, `/sync-event`, `/sync-batch`.
- **Tela no Perfil** (`/perfil`) para conectar Google/Outlook e copiar link iCal.
- **Painel da Agenda** com opção de exibir assinatura iCal e sincronizar todos os prazos.

### Fase 2 (depende de credenciais)

- Fluxo completo de OAuth com Google e Microsoft.
- Troca de `code` por `access_token` e `refresh_token`.
- Sincronização automática de eventos (único e em lote).
- Atualização e exclusão de eventos no calendário externo.
- Webhook/refresh de tokens expirados.

---

## 1. Variáveis de ambiente necessárias

Adicione no **Vercel** (ou `.env.local` para testes locais):

```env
# Google OAuth 2.0
GOOGLE_CLIENT_ID=seu_client_id
GOOGLE_CLIENT_SECRET=seu_client_secret
GOOGLE_REDIRECT_URI=https://backend-apimeta.vercel.app/api/calendar-integrations/callback?provider=google

# Microsoft / Azure AD
MICROSOFT_CLIENT_ID=seu_client_id
MICROSOFT_CLIENT_SECRET=seu_client_secret
MICROSOFT_REDIRECT_URI=https://backend-apimeta.vercel.app/api/calendar-integrations/callback?provider=outlook

# Criptografia de tokens (AES-256-GCM)
CALENDAR_ENCRYPTION_KEY=chave_de_32_bytes_em_hex_64_caracteres
```

> ⚠️ `CALENDAR_ENCRYPTION_KEY` deve ter exatamente **64 caracteres hexadecimais** (32 bytes).

### Gerar uma chave de criptografia

No PowerShell do Windows:

```powershell
[BitConverter]::ToString((1..32 | % { Get-Random -Maximum 256 } | % { [byte]$_ })).Replace('-','').ToLower()
```

No Linux/macOS:

```bash
openssl rand -hex 32
```

---

## 2. Criar aplicação no Google Cloud Console

1. Acesse [https://console.cloud.google.com/](https://console.cloud.google.com/).
2. Crie um novo projeto ou use um existente.
3. Vá em **APIs e serviços** → **Tela de consentimento OAuth**.
4. Escolha **Externo** e preencha os dados do aplicativo.
5. Em **Escopos**, adicione:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/userinfo.email`
6. Vá em **Credenciais** → **Criar credenciais** → **ID do cliente OAuth**.
7. Tipo: **Aplicativo da Web**.
8. Em **URIs de redirecionamento autorizadas**, adicione:
   - `https://backend-apimeta.vercel.app/api/calendar-integrations/callback?provider=google`
   - `http://localhost:3000/api/calendar-integrations/callback?provider=google` (para testes locais)
9. Copie **Client ID** e **Client Secret** para as variáveis `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.
10. Ative a **Google Calendar API** em **Biblioteca de APIs**.

---

## 3. Criar aplicação no Azure Portal (Microsoft)

1. Acesse [https://portal.azure.com/](https://portal.azure.com/).
2. Vá para **Azure Active Directory** (ou **Microsoft Entra ID**) → **Registros de aplicativo**.
3. Clique em **Novo registro**.
4. Nome: `Neves Costa - Agenda`.
5. Tipo de conta: **Contas em qualquer diretório organizacional e contas pessoais da Microsoft**.
6. Em **URI de redirecionamento**:
   - Plataforma: **Web**
   - URI: `https://backend-apimeta.vercel.app/api/calendar-integrations/callback?provider=outlook`
   - Adicione também `http://localhost:3000/api/calendar-integrations/callback?provider=outlook` para testes locais.
7. Vá em **Permissões de API** → **Adicionar uma permissão** → **Microsoft Graph** → **Permissões delegadas**:
   - `Calendars.ReadWrite`
   - `openid`
   - `email`
   - `profile`
   - `offline_access`
8. Em **Certificados e segredos**, crie um **Novo segredo do cliente**. Copie o valor.
9. Copie **ID do aplicativo (cliente)** para `MICROSOFT_CLIENT_ID` e o **segredo** para `MICROSOFT_CLIENT_SECRET`.

---

## 4. Ativar no Supabase

Aplique a migration `038_user_calendar_integrations.sql` no editor SQL do Supabase:

```sql
\i supabase/migrations/038_user_calendar_integrations.sql
```

Ou copie e cole o conteúdo do arquivo no painel SQL do Supabase.

A migration cria:

- Tabela `user_calendar_integrations` (tokens criptografados, email, provider, datas).
- Colunas `ical_token` e `ical_token_updated_at` na tabela `users`.
- Índices para `user_id`, `provider` e `ical_token`.

---

## 5. Como usar

### Assinatura iCal (sem OAuth)

1. Acesse a **Agenda** ou o **Perfil**.
2. Marque **"Sincronizar com calendário externo"** na agenda.
3. Clique em **"Copiar link iCal"**.
4. No Google Calendar, Outlook ou Apple Calendar, adicione por URL e cole o link.
5. O calendário buscará automaticamente as atualizações conforme a periodicidade do app.

### Conectar via OAuth

1. Acesse o **Perfil** (`/perfil`).
2. Clique em **Conectar Google Calendar** ou **Conectar Outlook Calendar**.
3. Autorize o aplicativo no provedor.
4. Após o redirecionamento, o token será salvo no banco e a sincronização será ativada.

### Sincronizar todos os prazos

1. Na **Agenda**, marque **"Sincronizar com calendário externo"**.
2. Clique em **"Sincronizar todos os prazos"**.
3. Selecione o provedor conectado.

---

## 6. Segurança

- Tokens OAuth são criptografados com `AES-256-GCM` antes de serem salvos.
- O link iCal é protegido por um UUID único por usuário. Para revogar, gere um novo link no Perfil.
- Nunca exponha `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET` ou `CALENDAR_ENCRYPTION_KEY` no frontend.
- Em produção, a Vercel fornece HTTPS automaticamente.

---

## 7. Testes locais

```bash
npm run dev
```

- Link iCal: `http://localhost:3000/api/calendar-sync/ical?token=<seu_token>`
- Callback Google: `http://localhost:3000/api/calendar-integrations/callback?provider=google`
- Callback Outlook: `http://localhost:3000/api/calendar-integrations/callback?provider=outlook`

Lembre-se de configurar as URIs de redirecionamento no Google Cloud e Azure para `localhost:3000`.
