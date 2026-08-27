/**
 * API: Notificações
 * Agrega notificações de múltiplas fontes para o usuário autenticado
 * SEGURANÇA: Filtra por user_id, sem PII em títulos
 */

import { createClient } from '@supabase/supabase-js';
import {
  sanitizeNotificationTitle,
  prioritizeNotification,
  getNotificationRoute,
  formatRelativeDate,
  isToday,
  isOverdue,
  validateNoPII
} from '../../lib/notificationHelpers';
import notificationCache from '../../lib/notificationCache';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Sanitiza erro para log
 */
function sanitizeError(error) {
  if (!error) return 'Unknown error';
  return {
    message: error.message || 'Unknown error',
    code: error.code,
    hint: error.hint
  };
}

/**
 * Obtém mensagens não lidas
 */
async function getUnreadMessages(userId, userRole) {
  try {
    let query = supabase
      .from('conversations')
      .select('id, client_name, unread, updated_at, assigned_user_id, legal_area, municipality')
      .eq('unread', true)
      .order('updated_at', { ascending: false })
      .limit(50);

    // Filtro por permissão
    if (userRole !== 'admin') {
      query = query.or(`assigned_user_id.eq.${userId},assigned_user_id.is.null`);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(conv => ({
      id: `message-${conv.id}`,
      type: 'message',
      reference_type: 'conversation',
      reference_id: conv.id,
      title: sanitizeNotificationTitle(conv, 'message'),
      priority: prioritizeNotification(conv, 'message'),
      isOverdue: false,
      isToday: isToday(conv.updated_at),
      createdAt: conv.updated_at,
      link: getNotificationRoute({ type: 'message', reference_id: conv.id }),
      readAt: null
    }));
  } catch (error) {
    console.error('[NOTIFICATIONS] Erro ao buscar mensagens:', sanitizeError(error));
    return [];
  }
}

/**
 * Obtém lembretes vencidos/próximos
 */
async function getReminders(userId, userRole) {
  try {
    const now = new Date();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let query = supabase
      .from('chat_reminders')
      .select('id, conversation_id, scheduled_for, reminder_text, completed, cancelled, created_by_user_id')
      .eq('completed', false)
      .eq('cancelled', false)
      .lte('scheduled_for', next7Days.toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(50);

    // Filtro por permissão
    if (userRole !== 'admin') {
      query = query.eq('created_by_user_id', userId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(reminder => {
      const overdueFlag = isOverdue(reminder.scheduled_for);
      const todayFlag = isToday(reminder.scheduled_for);
      const type = overdueFlag ? 'reminder_overdue' : 'reminder';

      return {
        id: `reminder-${reminder.id}`,
        type,
        reference_type: 'conversation',
        reference_id: reminder.conversation_id,
        title: sanitizeNotificationTitle(reminder, type),
        priority: prioritizeNotification(reminder, type),
        isOverdue: overdueFlag,
        isToday: todayFlag,
        createdAt: reminder.scheduled_for,
        link: getNotificationRoute({ type, reference_id: reminder.conversation_id }),
        readAt: null
      };
    });
  } catch (error) {
    console.error('[NOTIFICATIONS] Erro ao buscar lembretes:', sanitizeError(error));
    return [];
  }
}

/**
 * Obtém prazos de casos
 */
async function getDeadlines(userId, userRole) {
  try {
    const now = new Date();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let query = supabase
      .from('cases')
      .select(`
        id, 
        conversation_id, 
        deadline_date, 
        legal_area, 
        case_type, 
        priority,
        municipality,
        conversations!inner(assigned_user_id)
      `)
      .not('deadline_date', 'is', null)
      .lte('deadline_date', next7Days.toISOString().split('T')[0])
      .neq('status', 'encerrado')
      .order('deadline_date', { ascending: true })
      .limit(50);

    const { data, error } = await query;

    if (error) throw error;

    // Filtro por permissão no backend
    const filtered = (data || []).filter(c => {
      if (userRole === 'admin') return true;
      return c.conversations?.assigned_user_id === userId;
    });

    return filtered.map(caseItem => {
      const overdueFlag = isOverdue(caseItem.deadline_date);
      const todayFlag = isToday(caseItem.deadline_date);
      const type = overdueFlag ? 'deadline_overdue' : todayFlag ? 'deadline_today' : 'deadline';

      return {
        id: `deadline-${caseItem.id}`,
        type,
        reference_type: 'case',
        reference_id: caseItem.id,
        title: sanitizeNotificationTitle(caseItem, type),
        priority: prioritizeNotification(caseItem, type),
        isOverdue: overdueFlag,
        isToday: todayFlag,
        createdAt: caseItem.deadline_date,
        link: getNotificationRoute({ type, reference_id: caseItem.id }),
        readAt: null
      };
    });
  } catch (error) {
    console.error('[NOTIFICATIONS] Erro ao buscar prazos:', sanitizeError(error));
    return [];
  }
}

/**
 * Obtém eventos de casos
 */
async function getEvents(userId, userRole) {
  try {
    const today = new Date().toISOString().split('T')[0];

    let query = supabase
      .from('case_events')
      .select(`
        id,
        case_id,
        event_date,
        event_type,
        priority,
        cases!inner(
          conversation_id,
          legal_area,
          municipality,
          conversations!inner(assigned_user_id)
        )
      `)
      .eq('event_date', today)
      .order('event_date', { ascending: true })
      .limit(50);

    const { data, error } = await query;

    if (error) throw error;

    // Filtro por permissão
    const filtered = (data || []).filter(e => {
      if (userRole === 'admin') return true;
      return e.cases?.conversations?.assigned_user_id === userId;
    });

    return filtered.map(event => ({
      id: `event-${event.id}`,
      type: 'event_today',
      reference_type: 'event',
      reference_id: event.id,
      title: sanitizeNotificationTitle(event.cases || {}, 'event_today'),
      priority: prioritizeNotification(event, 'event_today'),
      isOverdue: false,
      isToday: true,
      createdAt: event.event_date,
      link: getNotificationRoute({ type: 'event_today', reference_id: event.id }),
      readAt: null
    }));
  } catch (error) {
    console.error('[NOTIFICATIONS] Erro ao buscar eventos:', sanitizeError(error));
    return [];
  }
}

/**
 * Obtém casos críticos
 */
async function getCriticalCases(userId, userRole) {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    let query = supabase
      .from('cases')
      .select(`
        id,
        conversation_id,
        legal_area,
        case_type,
        priority,
        municipality,
        updated_at,
        conversations!inner(assigned_user_id)
      `)
      .eq('priority', 'alta')
      .neq('status', 'encerrado')
      .lt('updated_at', sevenDaysAgo.toISOString())
      .order('updated_at', { ascending: true })
      .limit(20);

    const { data, error } = await query;

    if (error) throw error;

    // Filtro por permissão
    const filtered = (data || []).filter(c => {
      if (userRole === 'admin') return true;
      return c.conversations?.assigned_user_id === userId;
    });

    return filtered.map(caseItem => ({
      id: `case-${caseItem.id}`,
      type: 'case_critical',
      reference_type: 'case',
      reference_id: caseItem.id,
      title: sanitizeNotificationTitle(caseItem, 'case_critical'),
      priority: prioritizeNotification(caseItem, 'case_critical'),
      isOverdue: false,
      isToday: false,
      createdAt: caseItem.updated_at,
      link: getNotificationRoute({ type: 'case_critical', reference_id: caseItem.id }),
      readAt: null
    }));
  } catch (error) {
    console.error('[NOTIFICATIONS] Erro ao buscar casos críticos:', sanitizeError(error));
    return [];
  }
}

/**
 * Obtém movimentações não revisadas
 */
async function getUnreviewedMovements(userId, userRole) {
  try {
    let query = supabase
      .from('process_movements')
      .select(`
        id,
        case_id,
        movement_date,
        reviewed_at,
        cases!inner(
          conversation_id,
          legal_area,
          municipality,
          conversations!inner(assigned_user_id)
        )
      `)
      .is('reviewed_at', null)
      .order('movement_date', { ascending: false })
      .limit(50);

    const { data, error } = await query;

    if (error) throw error;

    // Filtro por permissão
    const filtered = (data || []).filter(m => {
      if (userRole === 'admin') return true;
      return m.cases?.conversations?.assigned_user_id === userId;
    });

    return filtered.map(movement => ({
      id: `movement-${movement.id}`,
      type: 'process_movement',
      reference_type: 'process_movement',
      reference_id: movement.id,
      title: sanitizeNotificationTitle(movement.cases || {}, 'process_movement'),
      priority: prioritizeNotification(movement, 'process_movement'),
      isOverdue: false,
      isToday: isToday(movement.movement_date),
      createdAt: movement.movement_date,
      link: getNotificationRoute({ type: 'process_movement', reference_id: movement.id }),
      readAt: null
    }));
  } catch (error) {
    console.error('[NOTIFICATIONS] Erro ao buscar movimentações:', sanitizeError(error));
    return [];
  }
}

/**
 * Obtém assinaturas pendentes
 */
async function getPendingSignatures(userId, userRole) {
  try {
    let query = supabase
      .from('document_signatures')
      .select('id, document_name, status, created_at, created_by_user_id')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50);

    // Apenas admin ou criador
    if (userRole !== 'admin') {
      query = query.eq('created_by_user_id', userId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(sig => ({
      id: `signature-${sig.id}`,
      type: 'signature',
      reference_type: 'signature',
      reference_id: sig.id,
      title: sanitizeNotificationTitle(sig, 'signature'),
      priority: prioritizeNotification(sig, 'signature'),
      isOverdue: false,
      isToday: isToday(sig.created_at),
      createdAt: sig.created_at,
      link: getNotificationRoute({ type: 'signature', reference_id: sig.id }),
      readAt: null
    }));
  } catch (error) {
    console.error('[NOTIFICATIONS] Erro ao buscar assinaturas:', sanitizeError(error));
    return [];
  }
}

/**
 * Agrega todas as notificações
 */
async function aggregateNotifications(userId, userRole) {
  const sources = [
    { name: 'messages', fn: getUnreadMessages },
    { name: 'reminders', fn: getReminders },
    { name: 'deadlines', fn: getDeadlines },
    { name: 'events', fn: getEvents },
    { name: 'critical_cases', fn: getCriticalCases },
    { name: 'movements', fn: getUnreviewedMovements },
    { name: 'signatures', fn: getPendingSignatures }
  ];

  const results = await Promise.allSettled(
    sources.map(s => s.fn(userId, userRole))
  );

  const notifications = [];
  const errors = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      notifications.push(...result.value);
    } else {
      errors.push({
        source: sources[i].name,
        error: result.reason?.message || 'Unknown error'
      });
      console.error(`[NOTIFICATIONS] Erro em ${sources[i].name}:`, result.reason);
    }
  });

  // Ordenar por prioridade e data
  const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
  notifications.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // Validar que nenhum título contém PII
  notifications.forEach(n => {
    if (!validateNoPII(n.title)) {
      console.error('[NOTIFICATIONS] ALERTA: PII detectada em título:', n.id);
    }
  });

  return { notifications, errors };
}

/**
 * Handler principal
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Autenticação (simplificada - ajustar conforme seu sistema)
    const userId = req.headers['x-user-id'] || req.query.user_id;
    const userRole = req.headers['x-user-role'] || req.query.user_role || 'advogado';

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Rate limiting
    if (!notificationCache.checkRateLimit(userId)) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    // Verificar cache
    const cached = notificationCache.get(userId, 'notifications');
    if (cached) {
      return res.status(200).json({ ...cached, cached: true });
    }

    // Agregar notificações
    const startTime = Date.now();
    const result = await aggregateNotifications(userId, userRole);
    const duration = Date.now() - startTime;

    console.log(`[NOTIFICATIONS] Agregadas ${result.notifications.length} notificações em ${duration}ms`);

    // Cachear resultado
    notificationCache.set(userId, result, 'notifications');

    return res.status(200).json({
      ...result,
      cached: false,
      duration
    });
  } catch (error) {
    console.error('[NOTIFICATIONS] Erro:', sanitizeError(error));
    return res.status(500).json({ error: 'Internal server error' });
  }
}
