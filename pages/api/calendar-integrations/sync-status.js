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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const userId = req.user.id;
  const { event_id, internal_table = 'cases' } = req.query;

  if (!event_id) {
    return res.status(400).json({ error: 'event_id obrigatório' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('calendar_synced_events')
      .select('external_event_id, synced_at, updated_at, last_sync_status, provider')
      .eq('internal_event_id', event_id)
      .eq('internal_table', internal_table)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = result not found
      throw error;
    }

    return res.status(200).json({
      synced: !!data,
      provider: data?.provider || null,
      external_event_id: data?.external_event_id || null,
      synced_at: data?.synced_at || null,
      updated_at: data?.updated_at || null,
      last_sync_status: data?.last_sync_status || null
    });
  } catch (error) {
    console.error('[CALENDAR-SYNC-STATUS] Erro:', error);
    return res.status(500).json({ error: error.message });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
