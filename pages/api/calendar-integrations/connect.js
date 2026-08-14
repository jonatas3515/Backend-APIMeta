import { randomUUID } from 'crypto';
import { withAuth } from '@/lib/auth';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI;

function isConfigured(provider) {
  if (provider === 'google') {
    return GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI;
  }
  if (provider === 'outlook') {
    return MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET && MICROSOFT_REDIRECT_URI;
  }
  return false;
}

function getAuthUrl(provider, state) {
  const encodedRedirect = encodeURIComponent(
    provider === 'google' ? GOOGLE_REDIRECT_URI : MICROSOFT_REDIRECT_URI
  );
  const encodedState = encodeURIComponent(state);

  if (provider === 'google') {
    return 'https://accounts.google.com/o/oauth2/v2/auth?' +
      `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
      `&redirect_uri=${encodedRedirect}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent('https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email')}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=${encodedState}`;
  }

  // Outlook / Microsoft
  return 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' +
    `client_id=${encodeURIComponent(MICROSOFT_CLIENT_ID)}` +
    `&redirect_uri=${encodedRedirect}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('openid email profile offline_access Calendars.ReadWrite')}` +
    `&state=${encodedState}`;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { provider } = req.body || {};
  if (!provider || !['google', 'outlook'].includes(provider)) {
    return res.status(400).json({ error: 'Provider inválido' });
  }

  if (!isConfigured(provider)) {
    return res.status(503).json({
      error: 'OAuth não configurado. Contate o administrador.',
      details: `Credenciais do ${provider} não foram definidas no ambiente.`
    });
  }

  // Fase 2: armazenar state para validar no callback
  const state = randomUUID();

  const authUrl = getAuthUrl(provider, state);
  res.status(200).json({ authUrl, provider });
}

export default withAuth(handler, { minRole: 'estagiario' });
