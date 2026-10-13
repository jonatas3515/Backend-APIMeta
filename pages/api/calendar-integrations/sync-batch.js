import { withAuth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, createGoogleEvent, updateGoogleEvent } from '@/lib/googleCalendar';
import { buildEventTitle, buildEventDescription } from './sync-event';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

const MAX_DAYS = 120;
const BATCH_LIMIT = 200;

function isConfigured() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  const { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI } = process.env;
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI) ||
    !!(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET && MICROSOFT_REDIRECT_URI);
}

// scheduled_for é TIMESTAMPTZ (UTC). Converte para data/hora locais de
// America/Bahia, que é o fuso usado por lib/googleCalendar.js ao montar
// start/end do evento.
function reminderToEventParts(scheduledFor) {
  const parts = new Date(scheduledFor)
    .toLocaleString('sv-SE', { timeZone: 'America/Bahia' })
    .split(' ');
  return { event_date: parts[0], event_time: parts[1] };
}

async function syncOneItem({ userId, item, table, syncedMap }) {
  const event = {
    title: buildEventTitle(item, table),
    description: buildEventDescription(item, table),
    event_date: item.deadline_date || item.event_date,
    event_time: item.event_time
  };

  if (table === 'chat_reminders') {
    const parts = reminderToEventParts(item.scheduled_for);
    event.event_date = parts.event_date;
    event.event_time = parts.event_time;
  }

  const key = `${table}:${item.id}`;
  const existingExternalId = syncedMap.get(key);

  let result;
  try {
    result = existingExternalId
      ? await updateGoogleEvent({ supabaseAdmin, userId, eventId: existingExternalId, event })
      : await createGoogleEvent({ supabaseAdmin, userId, event });
  } catch (error) {
    if (error.code === 'GOOGLE_EVENT_NOT_FOUND') {
      // Evento removido do Google: recria e re-vincula
      await supabaseAdmin
        .from('calendar_synced_events')
        .delete()
        .eq('internal_event_id', item.id)
        .eq('internal_table', table)
        .eq('provider', 'google')
        .eq('user_id', userId);
      result = await createGoogleEvent({ supabaseAdmin, userId, event });
    } else {
      throw error;
    }
  }

  const { error: upsertError } = await supabaseAdmin
    .from('calendar_synced_events')
    .upsert({
      internal_event_id: item.id,
      internal_table: table,
      provider: 'google',
      user_id: userId,
      external_event_id: result.id,
      external_calendar_id: 'primary',
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_sync_status: 'success'
    }, { onConflict: 'internal_event_id,internal_table,provider' });

  if (upsertError) {
    throw new Error('Erro ao salvar vinculação do evento');
  }

  return result;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
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

  if (provider !== 'google') {
    return res.status(501).json({ error: 'Provider Outlook ainda não implementado na Fase 2' });
  }

  const userId = req.user.id;
  const parsedDays = parseInt(days, 10);
  const daysAhead = Number.isFinite(parsedDays) ? Math.min(Math.max(parsedDays, 1), MAX_DAYS) : 30;

  try {
    const result = await syncUserCalendarBatch({ userId, daysAhead });

    if (result.skipped) {
      return res.status(400).json({ error: result.reason, reconnect: true });
    }

    if (result.aborted) {
      return res.status(401).json({
        success: false,
        error: result.reason,
        reconnect: true,
        syncedCount: result.syncedCount,
        errors: result.errors
      });
    }

    return res.status(200).json({
      success: result.errors.length === 0,
      syncedCount: result.syncedCount,
      failedCount: result.failedCount,
      total: result.total,
      errors: result.errors
    });
  } catch (error) {
    if (error.code === 'GOOGLE_AUTH_REQUIRED' || error.reconnect) {
      return res.status(401).json({ error: error.message, reconnect: true });
    }
    console.error('[CALENDAR-SYNC-BATCH] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ============================================================================
// Sincronização em lote por usuário — reutilizada pelo cron noturno
// (pages/api/cron/calendar-sync.js) e pelo endpoint POST acima.
// Retorna um resumo em vez de escrever na resposta HTTP:
//   { skipped }        — usuário sem integração/token válido
//   { aborted }        — Google exigiu reconexão no meio do lote
//   { syncedCount, failedCount, total, errors }
// ============================================================================
export async function syncUserCalendarBatch({ userId, daysAhead = 30 } = {}) {
  // Falha rápida: sem integração ativa/token válido não há o que sincronizar.
  try {
    await getValidAccessToken(supabaseAdmin, userId, 'google');
  } catch (error) {
    return { skipped: true, reason: error.message, syncedCount: 0, failedCount: 0, total: 0, errors: [] };
  }

  const today = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const endDateStr = endDate.toISOString().split('T')[0];
  const nowIso = new Date().toISOString();

    const [
      { data: cases, error: casesError },
      { data: caseEvents, error: eventsError },
      { data: reminders, error: remindersError },
      { data: synced, error: syncedError }
    ] = await Promise.all([
      supabaseAdmin
        .from('cases')
        .select('id, title, case_type, legal_area, municipality, priority, deadline_date')
        .not('deadline_date', 'is', null)
        .gte('deadline_date', today)
        .lte('deadline_date', endDateStr)
        .neq('status', 'encerrado')
        .limit(BATCH_LIMIT),
      supabaseAdmin
        .from('case_events')
        .select('id, case_id, event_date, event_time, event_type, description, priority')
        .gte('event_date', today)
        .lte('event_date', endDateStr)
        .limit(BATCH_LIMIT),
      supabaseAdmin
        .from('chat_reminders')
        .select('id, title, message, scheduled_for, status, priority')
        .eq('status', 'pending')
        .gte('scheduled_for', nowIso)
        .lte('scheduled_for', endDate.toISOString())
        .limit(BATCH_LIMIT),
      supabaseAdmin
        .from('calendar_synced_events')
        .select('internal_event_id, internal_table, external_event_id')
        .eq('provider', 'google')
        .eq('user_id', userId)
    ]);

    const queryError = casesError || eventsError || remindersError || syncedError;
    if (queryError) throw queryError;

    const syncedMap = new Map(
      (synced || []).map(s => [`${s.internal_table}:${s.internal_event_id}`, s.external_event_id])
    );

    const items = [
      ...(cases || []).map(item => ({ item, table: 'cases' })),
      ...(caseEvents || []).map(item => ({ item, table: 'case_events' })),
      ...(reminders || []).map(item => ({ item, table: 'chat_reminders' }))
    ];

    let syncedCount = 0;
    const errors = [];

    for (const { item, table } of items) {
      try {
        await syncOneItem({ userId, item, table, syncedMap });
        syncedCount++;
      } catch (error) {
        if (error.code === 'GOOGLE_AUTH_REQUIRED' || error.reconnect) {
          return {
            aborted: true,
            reason: error.message,
            syncedCount,
            failedCount: errors.length + (items.length - syncedCount - errors.length),
            total: items.length,
            errors
          };
        }
        errors.push({ internal_table: table, internal_event_id: item.id, error: error.message });
      }
    }

    // Marca execução do lote na integração (não falha o processo se falhar)
    await supabaseAdmin
      .from('user_calendar_integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_error: errors.length ? `${errors.length} item(ns) falharam na sincronização em lote` : null
      })
      .eq('user_id', userId)
      .eq('provider', 'google')
      .then(({ error }) => {
        if (error) console.error('[CALENDAR-SYNC-BATCH] Erro ao atualizar last_sync_at:', error.message);
      });

    return {
      syncedCount,
      failedCount: errors.length,
      total: items.length,
      errors
    };
}

export default withAuth(handler, { minRole: 'estagiario' });
