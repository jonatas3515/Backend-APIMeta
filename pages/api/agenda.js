import { createClient } from '@supabase/supabase-js';
import { askGemini } from '@/lib/ai';
import { withAuth } from '@/lib/auth';
import { safeLog, safeError } from '@/lib/safeLogger';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const { method } = req;

  try {
    if (method === 'GET') {
      return handleGet(req, res);
    } else if (method === 'POST') {
      return handlePost(req, res);
    } else {
      return res.status(405).json({ error: 'Método não permitido' });
    }
  } catch (error) {
    safeError('agenda_handler_error', error, { route: '/api/agenda' });
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });

function generateRequestId(req) {
  return req.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function enrichAgendaItems(items, startDate, endDate) {
  if (!items || items.length === 0) return;

  const caseIds = new Set();
  const reminderIds = new Set();
  const eventCaseIds = new Set();

  items.forEach((item) => {
    if (item.item_type === 'case_deadline' && item.case_id) {
      caseIds.add(item.case_id);
    } else if (item.item_type === 'reminder' && item.reminder_id) {
      reminderIds.add(item.reminder_id);
    } else if (item.item_type === 'case_event' && item.case_id) {
      eventCaseIds.add(item.case_id);
    }
  });

  const [caseResult, reminderResult, eventResult] = await Promise.allSettled([
    caseIds.size
      ? supabase.from('cases').select('id, updated_at').in('id', Array.from(caseIds))
      : { data: [] },
    reminderIds.size
      ? supabase.from('chat_reminders').select('id, updated_at').in('id', Array.from(reminderIds))
      : { data: [] },
    eventCaseIds.size
      ? supabase
          .from('case_events')
          .select('id, case_id, event_date, updated_at')
          .gte('event_date', startDate)
          .lte('event_date', endDate)
          .in('case_id', Array.from(eventCaseIds))
      : { data: [] }
  ]);

  const caseMap = new Map();
  (caseResult.value?.data || []).forEach((row) => {
    caseMap.set(row.id, row.updated_at);
  });

  const reminderMap = new Map();
  (reminderResult.value?.data || []).forEach((row) => {
    reminderMap.set(row.id, row.updated_at);
  });

  const eventMap = new Map();
  (eventResult.value?.data || []).forEach((row) => {
    const key = `${row.case_id}::${row.event_date}`;
    const existing = eventMap.get(key);
    if (!existing || new Date(row.updated_at) > new Date(existing.updated_at)) {
      eventMap.set(key, row);
    }
  });

  items.forEach((item) => {
    let internalUpdatedAt = null;
    let internalId = null;

    if (item.item_type === 'case_deadline' && item.case_id) {
      internalUpdatedAt = caseMap.get(item.case_id) || null;
      internalId = item.case_id;
    } else if (item.item_type === 'reminder' && item.reminder_id) {
      internalUpdatedAt = reminderMap.get(item.reminder_id) || null;
      internalId = item.reminder_id;
    } else if (item.item_type === 'case_event' && item.case_id && item.event_date) {
      const event = eventMap.get(`${item.case_id}::${item.event_date}`);
      if (event) {
        internalUpdatedAt = event.updated_at;
        internalId = event.id;
      }
    }

    item.internal_updated_at = internalUpdatedAt;
    item.internal_id = internalId || item.case_id;
  });
}

async function handleGet(req, res) {
  const requestId = generateRequestId(req);
  const { range = 'today', start_date, end_date, legal_area, municipality, agency, priority } = req.query;

  try {
    let startDate, endDate;

    if (range === 'today') {
      const today = new Date();
      startDate = today.toISOString().split('T')[0];
      endDate = today.toISOString().split('T')[0];
    } else if (range === 'week') {
      const today = new Date();
      startDate = today.toISOString().split('T')[0];
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      endDate = nextWeek.toISOString().split('T')[0];
    } else if (range === 'month') {
      const today = new Date();
      startDate = today.toISOString().split('T')[0];
      const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      endDate = nextMonth.toISOString().split('T')[0];
    } else if (start_date && end_date) {
      startDate = start_date;
      endDate = end_date;
    } else {
      return res.status(400).json({ error: 'Intervalo inválido' });
    }

    let items = null;
    let rpcError = null;

    try {
      const result = await supabase.rpc('get_agenda', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_legal_area: legal_area ? legal_area.toLowerCase() : null,
        p_municipality: municipality ? municipality.toLowerCase() : null,
        p_agency: agency ? agency.toLowerCase() : null,
        p_priority: priority ? priority.toLowerCase() : null
      });
      if (result.error) throw result.error;
      items = result.data;
    } catch (error) {
      safeError('agenda_rpc_error', error, { requestId, route: '/api/agenda', method: 'GET' });
      rpcError = error;
    }

    if (items === null) {
      safeLog('info', 'agenda_fallback', { requestId, route: '/api/agenda', reason: 'rpc_failed' });
      try {
        const { data, error } = await supabase
          .from('agenda_consolidada')
          .select('*')
          .gte('event_date', startDate)
          .lte('event_date', endDate);

        if (error) throw error;

        const rawItems = data || [];
        items = rawItems.filter((item) => {
          if (legal_area && item.legal_area?.toLowerCase() !== legal_area.toLowerCase()) return false;
          if (municipality && item.municipality?.toLowerCase() !== municipality.toLowerCase()) return false;
          if (agency && item.agency?.toLowerCase() !== agency.toLowerCase()) return false;
          if (priority && item.priority?.toLowerCase() !== priority.toLowerCase()) return false;
          return true;
        });
      } catch (fallbackError) {
        safeError('agenda_fallback_error', fallbackError, { requestId, route: '/api/agenda', method: 'GET' });
        return res.status(500).json({
          error: 'Não foi possível carregar a agenda. Tente novamente.'
        });
      }
    }

    await enrichAgendaItems(items, startDate, endDate);

    const byDay = {};
    (items || []).forEach((item) => {
      const dateKey = item.event_date;
      if (!byDay[dateKey]) {
        byDay[dateKey] = [];
      }
      byDay[dateKey].push({
        item_type: item.item_type || 'evento',
        title: item.title || 'Sem título',
        event_type: item.event_type || '',
        priority: item.priority || 'media',
        legal_area: item.legal_area || '',
        case_type: item.case_type || '',
        municipality: item.municipality || '',
        agency: item.agency || '',
        event_time: item.event_time || null,
        case_id: item.case_id || null,
        reminder_id: item.reminder_id || null,
        conversation_id: item.conversation_id || null,
        internal_id: item.internal_id || item.case_id || null,
        internal_updated_at: item.internal_updated_at || null
      });
    });

    return res.status(200).json({
      range,
      start_date: startDate,
      end_date: endDate,
      by_day: byDay,
      total_items: (items || []).length
    });
  } catch (error) {
    safeError('agenda_get_error', error, { requestId, route: '/api/agenda', method: 'GET' });
    return res.status(500).json({
      error: 'Não foi possível carregar a agenda. Tente novamente.'
    });
  }
}

async function handlePost(req, res) {
  const requestId = generateRequestId(req);
  const { action } = req.body;

  try {
    if (action === 'summary') {
      const { range = 'today', start_date, end_date, legal_area } = req.body;

      let startDate, endDate;

      if (range === 'today') {
        const today = new Date();
        startDate = today.toISOString().split('T')[0];
        endDate = today.toISOString().split('T')[0];
      } else if (range === 'week') {
        const today = new Date();
        startDate = today.toISOString().split('T')[0];
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        endDate = nextWeek.toISOString().split('T')[0];
      } else if (range === 'month') {
        const today = new Date();
        startDate = today.toISOString().split('T')[0];
        const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        endDate = nextMonth.toISOString().split('T')[0];
      } else if (start_date && end_date) {
        startDate = start_date;
        endDate = end_date;
      } else {
        return res.status(400).json({ error: 'Intervalo inválido' });
      }

      const { data: items, error } = await supabase.rpc('get_agenda', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_legal_area: legal_area || null,
        p_municipality: null,
        p_agency: null,
        p_priority: null
      });

      if (error) throw error;

      if (!items || items.length === 0) {
        return res.status(200).json({
          range,
          summary: 'Nenhum prazo ou lembrete agendado para este período.'
        });
      }

      const agendaData = items.map(i => ({
        date: i.event_date,
        title: i.title,
        type: i.item_type || 'evento',
        priority: i.priority,
        area: i.legal_area || 'Geral',
        location: i.municipality
      }));

      const agendaText = agendaData
        .map(item => {
          const location = item.location ? ` em ${item.location}` : '';
          return `- ${item.date}: ${item.title} (${item.type}, prioridade ${item.priority || 'média'}, ${item.area}${location})`;
        })
        .join('\n');

      const prompt = `Você é um assistente jurídico da Neves & Costa Advocacia. 
Baseado na agenda abaixo, gere um resumo executivo em tom informativo e operacional (não jurídico).
O resumo deve ser conciso (2-4 frases) e destacar os prazos mais urgentes.

AGENDA:
${agendaText}

Gere um resumo que:
1. Destaque os itens de alta prioridade
2. Mencione a quantidade total de prazos/lembretes
3. Seja em tom conversacional, não formal
4. Seja útil para um advogado ocupado

Responda APENAS com o resumo, sem explicações adicionais.`;

      const summary = await askGemini(prompt, '');

      return res.status(200).json({
        range,
        start_date: startDate,
        end_date: endDate,
        total_items: agendaData.length,
        summary: summary || 'Não foi possível gerar o resumo'
      });
    }
  } catch (error) {
    safeError('agenda_summary_error', error, { requestId, route: '/api/agenda', method: 'POST' });
    return res.status(500).json({ error: 'Não foi possível gerar o resumo. Tente novamente.' });
  }
}
