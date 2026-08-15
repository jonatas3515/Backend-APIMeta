import { createClient } from '@supabase/supabase-js';
import { encrypt } from '@/lib/encryption';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

function isConfigured(provider) {
  if (provider === 'google') {
    return GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI;
  }
  if (provider === 'outlook') {
    return MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET && MICROSOFT_REDIRECT_URI;
  }
  return false;
}

function redirectToError(res, message) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>Agenda - Conexão</title></head>
      <body style="font-family:sans-serif; padding:2rem; text-align:center;">
        <h1>⚠️ Conexão não concluída</h1>
        <p>${message}</p>
        <p><a href="/">Voltar para o sistema</a></p>
      </body>
    </html>
  `);
}

function redirectToSuccess(res, message) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>Agenda - Conectado</title></head>
      <body style="font-family:sans-serif; padding:2rem; text-align:center;">
        <h1>✅ Conexão realizada</h1>
        <p>${message}</p>
        <p>Você pode fechar esta janela e voltar ao sistema.</p>
        <p><a href="/">Voltar para o sistema</a></p>
      </body>
    </html>
  `);
}

async function exchangeGoogleCode(code) {
  const params = new URLSearchParams();
  params.append('code', code);
  params.append('client_id', GOOGLE_CLIENT_ID);
  params.append('client_secret', GOOGLE_CLIENT_SECRET);
  params.append('redirect_uri', GOOGLE_REDIRECT_URI);
  params.append('grant_type', 'authorization_code');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Erro ao trocar code do Google');
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in
  };
}

async function getGoogleEmail(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.email;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!supabaseAdmin) {
    return redirectToError(res, 'Supabase não configurado.');
  }

  const { provider = 'google', code, error: oauthError, state } = req.query;

  if (oauthError) {
    return redirectToError(res, `Erro retornado pelo provedor: ${oauthError}`);
  }

  if (!['google', 'outlook'].includes(provider)) {
    return redirectToError(res, 'Provider inválido.');
  }

  if (!code) {
    return redirectToError(res, 'Código de autorização não encontrado.');
  }

  if (!state) {
    return redirectToError(res, 'Parâmetro state ausente. Tente conectar novamente.');
  }

  if (!isConfigured(provider)) {
    return redirectToError(res, 'OAuth não configurado. Contate o administrador.');
  }

  // Valida state e expiração
  const { data: stateRecord, error: stateError } = await supabaseAdmin
    .from('calendar_oauth_states')
    .select('user_id, provider, expires_at')
    .eq('state', state)
    .single();

  if (stateError || !stateRecord) {
    return redirectToError(res, 'State inválido ou expirado. Tente conectar novamente.');
  }

  if (new Date(stateRecord.expires_at) < new Date()) {
    await supabaseAdmin.from('calendar_oauth_states').delete().eq('state', state);
    return redirectToError(res, 'O tempo para conectar expirou. Tente novamente.');
  }

  if (stateRecord.provider !== provider) {
    return redirectToError(res, 'Provider do state não confere.');
  }

  const userId = stateRecord.user_id;

  // Remove o state usado (one-time)
  await supabaseAdmin.from('calendar_oauth_states').delete().eq('state', state);

  if (provider === 'google') {
    try {
      const { access_token, refresh_token, expires_in } = await exchangeGoogleCode(code);

      if (!refresh_token) {
        return redirectToError(res, 'O Google não forneceu refresh_token. Tente revogar o acesso e conectar novamente.');
      }

      const email = await getGoogleEmail(access_token);
      const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

      const encryptedAccess = encrypt(access_token);
      const encryptedRefresh = encrypt(refresh_token);

      if (!encryptedAccess || !encryptedRefresh) {
        return redirectToError(res, 'Erro ao criptografar tokens. Verifique a chave de criptografia.');
      }

      // Remove integração antiga do usuário para o Google
      await supabaseAdmin
        .from('user_calendar_integrations')
        .delete()
        .eq('user_id', userId)
        .eq('provider', 'google');

      // Salva nova integração criptografada
      const { error: insertError } = await supabaseAdmin
        .from('user_calendar_integrations')
        .insert({
          user_id: userId,
          provider: 'google',
          email,
          access_token: null,
          refresh_token: null,
          access_token_encrypted: encryptedAccess,
          refresh_token_encrypted: encryptedRefresh,
          expires_at: expiresAt,
          is_active: true,
          connected_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('[CALENDAR-CALLBACK] Erro ao salvar integração:', insertError);
        return redirectToError(res, 'Erro ao salvar integração. Tente novamente.');
      }

      return redirectToSuccess(res, `Google Calendar conectado${email ? ` para ${email}` : ''}.`);
    } catch (error) {
      console.error('[CALENDAR-CALLBACK] Erro no fluxo Google:', error);
      return redirectToError(res, 'Erro ao trocar token do Google. Tente novamente.');
    }
  }

  // Outlook: Fase 3 futura
  return redirectToError(res, 'Troca de token do Outlook será implementada na Fase 3.');
}
