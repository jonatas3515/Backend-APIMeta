import { createClient } from '@supabase/supabase-js';

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { provider = 'google', code, error: oauthError } = req.query;

  if (oauthError) {
    return redirectToError(res, `Erro retornado pelo provedor: ${oauthError}`);
  }

  if (!['google', 'outlook'].includes(provider)) {
    return redirectToError(res, 'Provider inválido.');
  }

  if (!isConfigured(provider)) {
    return redirectToError(res, 'OAuth não configurado. Contate o administrador.');
  }

  // Fase 2: trocar code por tokens, criptografar e salvar.
  // Enquanto as credenciais não forem fornecidas, apenas retorna mensagem.
  return redirectToError(res, 'Troca de token será implementada na Fase 2. Credenciais detectadas, mas o fluxo de OAuth ainda não está ativo.');
}
