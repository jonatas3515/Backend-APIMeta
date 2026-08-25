import { createClient } from '@supabase/supabase-js';
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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const isAdmin = userRole === 'admin';

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const today = new Date().toISOString().split('T')[0];
    const todayDate = new Date();
    const threeDaysLater = new Date(todayDate.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const yesterdayStart = new Date(todayDate.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T00:00:00.000Z';
    const yesterdayEnd = yesterdayStart.split('T')[0] + 'T23:59:59.999Z';
    const todayStart = today + 'T00:00:00.000Z';
    const todayEnd = today + 'T23:59:59.999Z';
    const legalArea = req.query.legal_area || null;

    // 1. Próximos prazos (hoje + 3 dias) - de cases e case_events
    let nextDeadlines = [];
    try {
      const { data: caseDeadlines, error: caseError } = await supabase
        .from('cases')
        .select('id, title, legal_area, priority, deadline_date, status, conversation_id')
        .gte('deadline_date', today)
        .lte('deadline_date', threeDaysLater)
        .not('status', 'in', '("encerrado","cancelado")')
        .order('deadline_date', { ascending: true })
        .limit(10);

      if (caseError) throw caseError;

      const { data: eventDeadlines, error: eventsError } = await supabase
        .from('case_events')
        .select('id, case_id, event_date, event_type, description, priority, cases(title, legal_area, conversation_id)')
        .gte('event_date', today)
        .lte('event_date', threeDaysLater)
        .order('event_date', { ascending: true })
        .limit(10);

      if (eventsError) throw eventsError;

      nextDeadlines = [
        ...(caseDeadlines || []).map(c => ({
          id: c.id,
          type: 'case',
          title: c.title,
          legal_area: c.legal_area,
          priority: c.priority,
          due_date: c.deadline_date,
          case_id: c.id,
          conversation_id: c.conversation_id
        })),
        ...(eventDeadlines || []).map(e => ({
          id: e.id,
          type: 'event',
          title: e.description || e.event_type,
          legal_area: e.cases?.legal_area,
          priority: e.priority,
          due_date: e.event_date,
          case_id: e.case_id,
          conversation_id: e.cases?.conversation_id
        }))
      ].sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    } catch (e) {
      console.error('[DASHBOARD] Erro ao buscar prazos:', e);
    }

    // 2. Mensagens não lidas do WhatsApp
    let unreadConversations = [];
    let totalUnread = 0;
    try {
      // Conta mensagens inbound não lidas (sem campo de read, usaremos unread da conversations + últimas mensagens inbound)
      const { data: unreadConvs, error: unreadError } = await supabase
        .from('conversations')
        .select('id, client_name, client_phone, unread, updated_at, status, mode, legal_area')
        .eq('unread', true)
        .order('updated_at', { ascending: false })
        .limit(5);

      if (unreadError) throw unreadError;

      const conversationIds = (unreadConvs || []).map(c => c.id);
      let lastMessages = [];
      if (conversationIds.length > 0) {
        const { data: messages, error: messagesError } = await supabase
          .from('messages')
          .select('id, conversation_id, text, created_at')
          .in('conversation_id', conversationIds)
          .eq('direction', 'inbound')
          .order('created_at', { ascending: false });

        if (messagesError) throw messagesError;
        lastMessages = messages || [];
      }

      const messagesByConversation = {};
      (lastMessages || []).forEach(m => {
        if (!messagesByConversation[m.conversation_id]) {
          messagesByConversation[m.conversation_id] = m;
        }
      });

      unreadConversations = (unreadConvs || []).map(c => ({
        id: c.id,
        client_name: c.client_name,
        client_phone: c.client_phone,
        last_message: messagesByConversation[c.id]?.text?.substring(0, 60) || 'Nova mensagem',
        last_message_at: messagesByConversation[c.id]?.created_at || c.updated_at,
        unread: c.unread,
        legal_area: c.legal_area
      }));

      const { count, error: countError } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('unread', true);

      if (countError) throw countError;
      totalUnread = count || 0;
    } catch (e) {
      console.error('[DASHBOARD] Erro ao buscar mensagens não lidas:', e);
    }

    // 3. Casos em etapa crítica (proposta há mais de 5 dias)
    let criticalCases = [];
    try {
      const fiveDaysAgo = new Date(todayDate.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
      const { data: propostaCases, error: propostaError } = await supabase
        .from('cases')
        .select('id, title, legal_area, status, created_at, updated_at, conversation_id, conversations(client_name)')
        .eq('status', 'proposta_enviada')
        .lte('updated_at', fiveDaysAgo)
        .order('updated_at', { ascending: true })
        .limit(10);

      if (propostaError) throw propostaError;

      criticalCases = (propostaCases || []).map(c => {
        const daysInStage = Math.floor((new Date() - new Date(c.updated_at)) / (1000 * 60 * 60 * 24));
        return {
          id: c.id,
          title: c.title,
          client_name: c.conversations?.client_name,
          legal_area: c.legal_area,
          days_in_stage: daysInStage,
          case_id: c.id,
          conversation_id: c.conversation_id
        };
      });
    } catch (e) {
      console.error('[DASHBOARD] Erro ao buscar casos críticos:', e);
    }

    // 4. Tarefas atribuídas ao usuário logado
    let myTasks = [];
    try {
      let taskQuery = supabase
        .from('chat_reminders')
        .select('id, title, message, scheduled_for, priority, status, case_id, conversations(client_name, legal_area), cases(title, legal_area)')
        .eq('status', 'pending')
        .order('scheduled_for', { ascending: true })
        .limit(10);

      if (!isAdmin) {
        taskQuery = taskQuery.eq('assigned_user_id', userId);
      }

      const { data: tasks, error: tasksError } = await taskQuery;
      if (tasksError) throw tasksError;

      myTasks = (tasks || []).map(t => ({
        id: t.id,
        title: t.title || t.message,
        description: t.message,
        due_date: t.scheduled_for,
        priority: t.priority,
        status: t.status,
        case_id: t.case_id,
        case_title: t.cases?.title,
        client_name: t.conversations?.client_name,
        legal_area: t.cases?.legal_area || t.conversations?.legal_area
      }));
    } catch (e) {
      console.error('[DASHBOARD] Erro ao buscar tarefas:', e);
    }

    // 5. Métricas do dia
    let metrics = {
      new_leads_today: 0,
      new_leads_yesterday: 0,
      contracts_today: 0,
      contracts_yesterday: 0,
      active_cases: 0,
      due_today: 0,
      leads_comparison: '+0 vs ontem',
      contracts_comparison: '+0 vs ontem'
    };

    try {
      // Novos leads hoje
      let leadsTodayQuery = supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd);
      if (legalArea) leadsTodayQuery = leadsTodayQuery.eq('legal_area', legalArea);
      const { count: leadsToday, error: leadsTodayError } = await leadsTodayQuery;

      if (leadsTodayError) throw leadsTodayError;

      // Novos leads ontem
      let leadsYesterdayQuery = supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterdayStart)
        .lte('created_at', yesterdayEnd);
      if (legalArea) leadsYesterdayQuery = leadsYesterdayQuery.eq('legal_area', legalArea);
      const { count: leadsYesterday, error: leadsYesterdayError } = await leadsYesterdayQuery;

      if (leadsYesterdayError) throw leadsYesterdayError;

      // Contratos fechados hoje
      let contractsTodayQuery = supabase
        .from('cases')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'contrato_assinado')
        .gte('updated_at', todayStart)
        .lte('updated_at', todayEnd);
      if (legalArea) contractsTodayQuery = contractsTodayQuery.eq('legal_area', legalArea);
      const { count: contractsToday, error: contractsTodayError } = await contractsTodayQuery;

      if (contractsTodayError) throw contractsTodayError;

      // Contratos fechados ontem
      let contractsYesterdayQuery = supabase
        .from('cases')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'contrato_assinado')
        .gte('updated_at', yesterdayStart)
        .lte('updated_at', yesterdayEnd);
      if (legalArea) contractsYesterdayQuery = contractsYesterdayQuery.eq('legal_area', legalArea);
      const { count: contractsYesterday, error: contractsYesterdayError } = await contractsYesterdayQuery;

      if (contractsYesterdayError) throw contractsYesterdayError;

      // Casos ativos totais
      let activeCasesQuery = supabase
        .from('cases')
        .select('*', { count: 'exact', head: true })
        .not('status', 'in', '("encerrado","cancelado")');
      if (legalArea) activeCasesQuery = activeCasesQuery.eq('legal_area', legalArea);
      const { count: activeCases, error: activeError } = await activeCasesQuery;

      if (activeError) throw activeError;

      // Prazos vencendo hoje
      let dueTodayQuery = supabase
        .from('cases')
        .select('*', { count: 'exact', head: true })
        .eq('deadline_date', today)
        .not('status', 'in', '("encerrado","cancelado")');
      if (legalArea) dueTodayQuery = dueTodayQuery.eq('legal_area', legalArea);
      const { count: dueToday, error: dueError } = await dueTodayQuery;

      if (dueError) throw dueError;

      const leadsDiff = (leadsToday || 0) - (leadsYesterday || 0);
      const contractsDiff = (contractsToday || 0) - (contractsYesterday || 0);

      metrics = {
        new_leads_today: leadsToday || 0,
        new_leads_yesterday: leadsYesterday || 0,
        contracts_today: contractsToday || 0,
        contracts_yesterday: contractsYesterday || 0,
        active_cases: activeCases || 0,
        due_today: dueToday || 0,
        leads_comparison: `${leadsDiff >= 0 ? '+' : ''}${leadsDiff} vs ontem`,
        contracts_comparison: `${contractsDiff >= 0 ? '+' : ''}${contractsDiff} vs ontem`
      };
    } catch (e) {
      console.error('[DASHBOARD] Erro ao buscar métricas:', e);
    }

    return res.status(200).json({
      today,
      next_deadlines: nextDeadlines,
      unread_messages: {
        total: totalUnread,
        conversations: unreadConversations
      },
      critical_cases: criticalCases,
      my_tasks: myTasks,
      metrics
    });
  } catch (error) {
    console.error('[DASHBOARD] Erro geral:', error);
    return res.status(500).json({ 
      error: error.message || 'Erro ao carregar dashboard',
      details: error.toString()
    });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
