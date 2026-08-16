import { createClient } from '@supabase/supabase-js';
import { askGemini } from '@/lib/ai';
import { withAuth } from '@/lib/auth';

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
    console.error('[AGENDA] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });

async function handleGet(req, res) {
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
      console.error('[AGENDA] get_agenda falhou:', error);
      rpcError = error;
    }

    if (items === null) {
      console.log('[AGENDA] Tentando fallback via agenda_consolidada...');
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
        console.error('[AGENDA] Fallback falhou:', fallbackError);
        return res.status(500).json({
          error: 'Erro ao buscar agenda',
          rpcError: rpcError ? String(rpcError.message || rpcError) : null,
          fallbackError: String(fallbackError.message || fallbackError),
          code: (rpcError && rpcError.code) || (fallbackError && fallbackError.code) || null
        });
      }
    }

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
        conversation_id: item.conversation_id || null
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
    console.error('[AGENDA] Erro geral:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao buscar agenda'
    });
  }
}

async function handlePost(req, res) {
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
    console.error('[AGENDA] Erro ao gerar resumo:', error);
    return res.status(500).json({ error: 'Erro ao gerar resumo' });
  }
}
