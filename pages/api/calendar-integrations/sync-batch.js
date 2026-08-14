import { withAuth } from '@/lib/auth';

function isConfigured() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  const { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI } = process.env;
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI) ||
    !!(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET && MICROSOFT_REDIRECT_URI);
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!isConfigured()) {
    return res.status(503).json({
      error: 'OAuth não configurado. Contate o administrador.',
      details: 'Nenhum provider de calendário externo foi configurado.'
    });
  }

  const { provider, days = 30 } = req.body || {};

  if (!provider || !['google', 'outlook'].includes(provider)) {
    return res.status(400).json({ error: 'Provider inválido' });
  }

  // Fase 2: buscar integração do usuário, listar eventos futuros e sincronizar em lote
  return res.status(501).json({
    success: false,
    message: 'Sincronização em lote será implementada na Fase 2.'
  });
}

export default withAuth(handler, { minRole: 'estagiario' });
