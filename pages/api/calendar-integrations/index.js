import { withAuth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

async function handler(req, res) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const userId = req.user.id;

  if (req.method === 'GET') {
    const [{ data: integrations }, { data: user }] = await Promise.all([
      supabaseAdmin
        .from('user_calendar_integrations')
        .select('id, provider, email, connected_at, updated_at, is_active, expires_at, last_sync_at, last_sync_error')
        .eq('user_id', userId),
      supabaseAdmin
        .from('users')
        .select('ical_token')
        .eq('id', userId)
        .single()
    ]);

    const host = req.headers.host || 'backend-apimeta.vercel.app';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const icalUrl = user?.ical_token
      ? `${protocol}://${host}/api/calendar-sync/ical?token=${user.ical_token}`
      : null;

    // Marca integrações expiradas como inativas
    const now = new Date();
    const activeIntegrations = (integrations || []).map(i => ({
      ...i,
      is_active: i.is_active && new Date(i.expires_at) > now
    }));

    return res.status(200).json({
      integrations: activeIntegrations,
      icalUrl
    });
  }

  if (req.method === 'DELETE') {
    const { provider } = req.query;
    if (!provider) {
      return res.status(400).json({ error: 'Provider não informado' });
    }

    // Marca como inativa ao invés de deletar (preserva auditoria)
    const { error } = await supabaseAdmin
      .from('user_calendar_integrations')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
        access_token_encrypted: null,
        refresh_token_encrypted: null
      })
      .eq('user_id', userId)
      .eq('provider', provider);

    if (error) {
      console.error('[CALENDAR] Erro ao desativar integração:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Método não permitido' });
}

export default withAuth(handler, { minRole: 'estagiario' });
