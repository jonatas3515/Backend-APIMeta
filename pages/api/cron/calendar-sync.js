import { createClient } from '@supabase/supabase-js';
import { syncUserCalendarBatch } from '../calendar-integrations/sync-batch';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const SYNC_DAYS_AHEAD = 60;

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
    const { data: integrations, error } = await supabase
      .from('user_calendar_integrations')
      .select('user_id')
      .eq('provider', 'google')
      .eq('is_active', true);

    if (error) throw error;

    let usersProcessed = 0;
    let usersFailed = 0;
    let totalSynced = 0;
    let totalFailed = 0;

    for (const integration of integrations || []) {
      const userId = integration.user_id;
      try {
        const result = await syncUserCalendarBatch({ userId, daysAhead: SYNC_DAYS_AHEAD });
        usersProcessed++;

        if (result.skipped || result.aborted) {
          usersFailed++;
          console.warn(`[CRON-CALENDAR] Sincronização do usuário ${userId} ignorada/abortada: ${result.reason}`);
        }

        totalSynced += result.syncedCount || 0;
        totalFailed += result.failedCount || 0;
      } catch (error) {
        // Isolamento por usuário: falha de um não derruba a rotina
        usersProcessed++;
        usersFailed++;
        console.error(`[CRON-CALENDAR] Falha ao sincronizar usuário ${userId}:`, error?.message || 'unknown');
      }
    }

    console.log(`[CRON-CALENDAR] Concluído: ${usersProcessed} usuário(s), ${totalSynced} evento(s) sincronizados, ${totalFailed} falha(s)`);

    return res.status(200).json({
      success: true,
      usersProcessed,
      usersFailed,
      totalSynced,
      totalFailed
    });
  } catch (error) {
    console.error('[CRON-CALENDAR] Erro geral:', error?.message || 'unknown');
    return res.status(500).json({ error: 'Erro na sincronização em lote' });
  }
}
