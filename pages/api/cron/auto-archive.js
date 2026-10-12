import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const INACTIVITY_DAYS = 7;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  try {
    const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // REGRA DE SEGURANÇA: nunca arquivar conversa com mensagem não lida
    // pendente (unread = true). Conversas sem flag unread (null) são
    // tratadas como lidas. Só toca em conversas ainda não arquivadas.
    const { data, error } = await supabase
      .from('conversations')
      .update({ archived: true, archived_at: new Date().toISOString() })
      .or('archived.is.null,archived.eq.false')
      .or('unread.is.null,unread.eq.false')
      .lt('updated_at', cutoff)
      .select('id');

    if (error) throw error;

    const archived = (data || []).length;
    console.log(`[CRON] Auto-arquivamento concluído: ${archived} conversa(s) arquivada(s)`);

    return res.status(200).json({
      success: true,
      archived,
      cutoff
    });
  } catch (error) {
    console.error('[CRON] Erro no auto-arquivamento:', error?.message || 'unknown');
    return res.status(500).json({ error: 'Erro ao arquivar conversas' });
  }
}
