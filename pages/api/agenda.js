import { createClient } from '@supabase/supabase-js';
import { askGemini } from '@/lib/ai';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export default async function handler(req, res) {
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

async function handleGet(req, res) {
  const { action, range = 'today', start_date, end_date, legal_area, municipality, agency, priority } = req.query;

  try {
    let startDate, endDate;

    // Determina intervalo
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

    if (action === 'today') {
      // Retorna apenas itens de hoje
      const { data, error } = await supabase.rpc('get_agenda', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_legal_area: legal_area || null,
        p_municipality: municipality || null,
        p_agency: agency || null,
        p_priority: priority || null
      });

      if (error) throw error;

      return res.status(200).json({
        date: startDate,
        items: data || [],
        total: data?.length || 0
      });
    } else if (action === 'count') {
      // Retorna contagem por dia
      const { data, error } = await supabase.rpc('count_agenda_by_day', {
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) throw error;

      return res.status(200).json(data || []);
    } else {
      // Retorna agenda completa com agrupamento por dia
      const { data, error } = await supabase.rpc('get_agenda', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_legal_area: legal_area || null,
        p_municipality: municipality || null,
        p_agency: agency || null,
        p_priority: priority || null
      });

      if (error) throw error;

      // Agrupa por dia
      const grouped = {};
      (data || []).forEach(item => {
        if (!grouped[item.event_date]) {
          grouped[item.event_date] = [];
        }
        grouped[item.event_date].push(item);
      });

      return res.status(200).json({
        range,
        start_date: startDate,
        end_date: endDate,
        by_day: grouped,
        total_items: data?.length || 0
      });
    }
  } catch (error) {
    console.error('[AGENDA] Erro ao buscar:', error);
    return res.status(500).json({ error: 'Erro ao buscar agenda' });
  }
}

async function handlePost(req, res) {
  const { action } = req.body;

  try {
    if (action === 'summary') {
      const { range = 'today', start_date, end_date } = req.body;

      // Busca agenda
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
      } else if (start_date && end_date) {
        startDate = start_date;
        endDate = end_date;
      } else {
        return res.status(400).json({ error: 'Intervalo inválido' });
      }

      const { data: agendaData, error: agendaError } = await supabase.rpc('get_agenda', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_legal_area: null,
        p_municipality: null,
        p_agency: null,
        p_priority: null
      });

      if (agendaError) throw agendaError;

      if (!agendaData || agendaData.length === 0) {
        return res.status(200).json({
          range,
          summary: 'Nenhum prazo ou lembrete agendado para este período.'
        });
      }

      // Prepara dados para IA
      const agendaText = agendaData
        .map(item => {
          const date = item.event_date;
          const type = item.event_type || 'evento';
          const priority = item.priority || 'média';
          const area = item.legal_area || 'Geral';
          const title = item.title || 'Sem título';
          const location = item.municipality ? ` em ${item.municipality}` : '';

          return `- ${date}: ${title} (${type}, prioridade ${priority}, ${area}${location})`;
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
