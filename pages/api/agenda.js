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
  const { action, range = 'today', start_date, end_date, legal_area, municipality, agency, priority } = req.query;

  try {
    console.log('[AGENDA] Iniciando handleGet com range:', range);
    
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

    console.log('[AGENDA] Intervalo:', startDate, 'a', endDate);

    // Busca casos com prazos
    try {
      let casesQuery = supabase
        .from('cases')
        .select('id, conversation_id, legal_area, case_type, municipality, agency, deadline_date, deadline_type, priority, status')
        .gte('deadline_date', startDate)
        .lte('deadline_date', endDate);

      if (legal_area) casesQuery = casesQuery.eq('legal_area', legal_area);
      if (municipality) casesQuery = casesQuery.eq('municipality', municipality);
      if (agency) casesQuery = casesQuery.eq('agency', agency);
      if (priority) casesQuery = casesQuery.eq('priority', priority);

      const { data: cases, error: casesError } = await casesQuery;
      if (casesError) {
        console.error('[AGENDA] Erro ao buscar cases:', casesError);
        throw casesError;
      }
      console.log('[AGENDA] Cases encontrados:', cases?.length || 0);
    } catch (e) {
      console.error('[AGENDA] Erro na busca de cases:', e.message);
      // Continua mesmo se cases falhar
    }

    // Busca lembretes
    try {
      let remindersQuery = supabase
        .from('chat_reminders')
        .select('id, conversation_id, reminder_type, scheduled_for, priority, description, case_id')
        .gte('scheduled_for', startDate)
        .lte('scheduled_for', endDate);

      if (priority) remindersQuery = remindersQuery.eq('priority', priority);

      const { data: reminders, error: remindersError } = await remindersQuery;
      if (remindersError) {
        console.error('[AGENDA] Erro ao buscar reminders:', remindersError);
        throw remindersError;
      }
      console.log('[AGENDA] Reminders encontrados:', reminders?.length || 0);
    } catch (e) {
      console.error('[AGENDA] Erro na busca de reminders:', e.message);
      // Continua mesmo se reminders falhar
    }

    // Busca eventos
    try {
      let eventsQuery = supabase
        .from('case_events')
        .select('id, case_id, event_date, event_type, description, priority, location')
        .gte('event_date', startDate)
        .lte('event_date', endDate);

      if (priority) eventsQuery = eventsQuery.eq('priority', priority);

      const { data: events, error: eventsError } = await eventsQuery;
      if (eventsError) {
        console.error('[AGENDA] Erro ao buscar events:', eventsError);
        throw eventsError;
      }
      console.log('[AGENDA] Events encontrados:', events?.length || 0);
    } catch (e) {
      console.error('[AGENDA] Erro na busca de events:', e.message);
      // Continua mesmo se events falhar
    }

    // Retorna resposta vazia se nenhuma tabela existir
    return res.status(200).json({
      range,
      start_date: startDate,
      end_date: endDate,
      by_day: {},
      total_items: 0,
      message: 'Nenhum item agendado para este período'
    });
  } catch (error) {
    console.error('[AGENDA] Erro geral:', error);
    return res.status(500).json({ 
      error: error.message || 'Erro ao buscar agenda',
      details: error.toString()
    });
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

      // Busca casos com prazos
      const { data: cases, error: casesError } = await supabase
        .from('cases')
        .select('id, deadline_date, deadline_type, priority, legal_area, municipality')
        .gte('deadline_date', startDate)
        .lte('deadline_date', endDate);

      if (casesError) throw casesError;

      // Busca lembretes
      const { data: reminders, error: remindersError } = await supabase
        .from('chat_reminders')
        .select('id, scheduled_for, description, reminder_type, priority')
        .gte('scheduled_for', startDate)
        .lte('scheduled_for', endDate);

      if (remindersError) throw remindersError;

      const agendaData = [
        ...(cases || []).map(c => ({
          date: c.deadline_date,
          title: `Prazo: ${c.deadline_type}`,
          type: 'case',
          priority: c.priority,
          area: c.legal_area,
          location: c.municipality
        })),
        ...(reminders || []).map(r => ({
          date: r.scheduled_for,
          title: r.description || r.reminder_type,
          type: 'reminder',
          priority: r.priority
        }))
      ];

      if (!agendaData || agendaData.length === 0) {
        return res.status(200).json({
          range,
          summary: 'Nenhum prazo ou lembrete agendado para este período.'
        });
      }

      // Prepara dados para IA
      const agendaText = agendaData
        .map(item => {
          const date = item.date;
          const type = item.type || 'evento';
          const priority = item.priority || 'média';
          const area = item.area || 'Geral';
          const title = item.title || 'Sem título';
          const location = item.location ? ` em ${item.location}` : '';

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
