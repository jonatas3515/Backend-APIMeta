import { withAuth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import { createGoogleEvent, updateGoogleEvent, deleteGoogleEvent } from '@/lib/googleCalendar';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

function isConfigured() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  const { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI } = process.env;
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI) ||
    !!(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET && MICROSOFT_REDIRECT_URI);
}

async function handler(req, res) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!isConfigured()) {
    return res.status(503).json({
      error: 'OAuth não configurado. Contate o administrador.',
      details: 'Nenhum provider de calendário externo foi configurado.'
    });
  }

  const { event_id, internal_table, action = 'sync', provider } = req.body || {};

  if (!event_id || !internal_table) {
    return res.status(400).json({ error: 'event_id e internal_table são obrigatórios' });
  }

  if (!provider || !['google', 'outlook'].includes(provider)) {
    return res.status(400).json({ error: 'Provider inválido' });
  }

  if (provider !== 'google') {
    return res.status(501).json({ error: 'Provider Outlook ainda não implementado na Fase 2' });
  }

  const userId = req.user.id;

  try {
    if (action === 'delete') {
      // Busca external_id já sincronizado
      const { data: syncRecord } = await supabaseAdmin
        .from('calendar_synced_events')
        .select('external_event_id')
        .eq('internal_event_id', event_id)
        .eq('internal_table', internal_table)
        .eq('provider', provider)
        .eq('user_id', userId)
        .single();

      if (syncRecord?.external_event_id) {
        await deleteGoogleEvent({ supabaseAdmin, userId, eventId: syncRecord.external_event_id });
        await supabaseAdmin
          .from('calendar_synced_events')
          .delete()
          .eq('internal_event_id', event_id)
          .eq('internal_table', internal_table)
          .eq('provider', provider)
          .eq('user_id', userId);
      }

      return res.status(200).json({ success: true, action: 'delete' });
    }

    // Busca evento interno
    const { data: internalEvent, error: findError } = await supabaseAdmin
      .from(internal_table)
      .select('*')
      .eq('id', event_id)
      .single();

    if (findError || !internalEvent) {
      return res.status(404).json({ error: 'Evento interno não encontrado' });
    }

    // Formata dados do evento para Google
    const event = {
      title: buildEventTitle(internalEvent, internal_table),
      description: buildEventDescription(internalEvent, internal_table),
      event_date: internalEvent.event_date || internalEvent.deadline_date || internalEvent.scheduled_for,
      event_time: internalEvent.event_time
    };

    // Verifica se já existe external_id
    const { data: existingSync } = await supabaseAdmin
      .from('calendar_synced_events')
      .select('external_event_id')
      .eq('internal_event_id', event_id)
      .eq('internal_table', internal_table)
      .eq('provider', provider)
      .eq('user_id', userId)
      .single();

    let result;

    if (existingSync?.external_event_id) {
      result = await updateGoogleEvent({
        supabaseAdmin,
        userId,
        eventId: existingSync.external_event_id,
        event
      });
    } else {
      result = await createGoogleEvent({ supabaseAdmin, userId, event });
    }

    // Salva/Atualiza vinculação
    const { error: upsertError } = await supabaseAdmin
      .from('calendar_synced_events')
      .upsert({
        internal_event_id: event_id,
        internal_table,
        provider,
        user_id: userId,
        external_event_id: result.id,
        external_calendar_id: 'primary',
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_sync_status: 'success'
      }, { onConflict: 'internal_event_id,internal_table,provider' });

    if (upsertError) {
      console.error('[CALENDAR-SYNC] Erro ao salvar vinculação:', upsertError);
      return res.status(500).json({ error: 'Erro ao salvar vinculação do evento' });
    }

    return res.status(200).json({
      success: true,
      action: existingSync ? 'update' : 'create',
      external_event_id: result.id,
      html_link: result.htmlLink
    });

  } catch (error) {
    console.error('[CALENDAR-SYNC-EVENT] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

function buildEventTitle(internalEvent, table) {
  if (table === 'cases') return `Prazo: ${internalEvent.title || 'Caso #' + internalEvent.id}`;
  if (table === 'chat_reminders') return `Lembrete: ${internalEvent.description || 'Lembrete #' + internalEvent.id}`;
  if (table === 'case_events') return `${internalEvent.event_type || 'Evento'}: ${internalEvent.description || 'Evento #' + internalEvent.id}`;
  return 'Evento N&C';
}

function buildEventDescription(internalEvent, table) {
  if (table === 'cases') {
    return `Caso #${internalEvent.id} - ${internalEvent.case_type || ''}\nÁrea: ${internalEvent.legal_area || ''}\nMunicípio: ${internalEvent.municipality || ''}\nPrioridade: ${internalEvent.priority || ''}`;
  }
  if (table === 'chat_reminders') {
    return internalEvent.description || '';
  }
  if (table === 'case_events') {
    return internalEvent.description || '';
  }
  return '';
}

export default withAuth(handler, { minRole: 'estagiario' });
