/**
 * Notification Aggregator
 * Fonte unica de verdade para selecao, filtragem, deduplicacao e autorizacao
 * de notificacoes. Usada por /api/notifications e /api/notifications/count.
 * SEGURANCA: Nao expoe PII, segredos, URLs externas ou dados de outros usuarios.
 */

import { createClient } from '@supabase/supabase-js';
import {
  normalizeNotification,
  sanitizeNotificationTitle,
  prioritizeNotification,
  isToday,
  isOverdue,
} from './notificationHelpers';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

function safeErrorCode(reason) {
  if (!reason) return 'unknown';
  if (typeof reason === 'string') return 'error';
  const code = reason.code || reason.status || reason.statusCode;
  if (code) return String(code);
  if (reason.message && typeof reason.message === 'string') return reason.message;
  return 'error';
}

function withError(source, error) {
  const code = safeErrorCode(error);
  console.error(`[NOTIFICATIONS] Fonte ${source} falhou: ${code}`);
  return { source, code };
}

async function getUnreadMessages(userId, userRole) {
  if (!supabase) throw new Error('supabase_not_configured');

  let query = supabase
    .from('conversations')
    .select('id, client_name, unread, updated_at, assigned_user_id, legal_area, municipality')
    .eq('unread', true)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (userRole !== 'admin') {
    query = query.or(`assigned_user_id.eq.${userId},assigned_user_id.is.null`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(conv =>
    normalizeNotification({
      id: `message-${conv.id}`,
      type: 'message',
      reference_type: 'conversation',
      reference_id: conv.id,
      item: conv,
      createdAt: conv.updated_at,
      isOverdue: false,
      isToday: isToday(conv.updated_at),
    })
  ).filter(Boolean);
}

async function getReminders(userId, userRole) {
  if (!supabase) throw new Error('supabase_not_configured');

  const now = new Date();
  const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let query = supabase
    .from('chat_reminders')
    .select('id, conversation_id, case_id, scheduled_for, reminder_text, completed, cancelled, created_by_user_id')
    .eq('completed', false)
    .eq('cancelled', false)
    .lte('scheduled_for', next7Days.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(50);

  if (userRole !== 'admin') {
    query = query.eq('created_by_user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(reminder => {
    const overdueFlag = isOverdue(reminder.scheduled_for);
    const todayFlag = isToday(reminder.scheduled_for);
    const type = overdueFlag ? 'reminder_overdue' : 'reminder';

    return normalizeNotification({
      id: `reminder-${reminder.id}`,
      type,
      reference_type: 'conversation',
      reference_id: reminder.conversation_id,
      item: reminder,
      createdAt: reminder.scheduled_for,
      conversationId: reminder.conversation_id,
      caseId: reminder.case_id,
      reminderId: reminder.id,
      isOverdue: overdueFlag,
      isToday: todayFlag,
    });
  }).filter(Boolean);
}

async function getDeadlines(userId, userRole) {
  if (!supabase) throw new Error('supabase_not_configured');

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

  const filtered = (data || []).filter(c => {
    if (userRole === 'admin') return true;
    return c.conversations?.assigned_user_id === userId;
  });

  return filtered.map(caseItem => {
    const overdueFlag = isOverdue(caseItem.deadline_date);
    const todayFlag = isToday(caseItem.deadline_date);
    const type = overdueFlag ? 'deadline_overdue' : todayFlag ? 'deadline_today' : 'deadline';

    return normalizeNotification({
      id: `deadline-${caseItem.id}`,
      type,
      reference_type: 'case',
      reference_id: caseItem.id,
      item: caseItem,
      createdAt: caseItem.deadline_date,
      caseId: caseItem.id,
      isOverdue: overdueFlag,
      isToday: todayFlag,
    });
  }).filter(Boolean);
}

async function getEvents(userId, userRole) {
  if (!supabase) throw new Error('supabase_not_configured');

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

  const filtered = (data || []).filter(e => {
    if (userRole === 'admin') return true;
    return e.cases?.conversations?.assigned_user_id === userId;
  });

  return filtered.map(event =>
    normalizeNotification({
      id: `event-${event.id}`,
      type: 'event_today',
      reference_type: 'event',
      reference_id: event.id,
      item: event.cases || {},
      createdAt: event.event_date,
      eventId: event.id,
      caseId: event.case_id,
      isOverdue: false,
      isToday: true,
    })
  ).filter(Boolean);
}

async function getCriticalCases(userId, userRole) {
  if (!supabase) throw new Error('supabase_not_configured');

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

  const filtered = (data || []).filter(c => {
    if (userRole === 'admin') return true;
    return c.conversations?.assigned_user_id === userId;
  });

  return filtered.map(caseItem =>
    normalizeNotification({
      id: `case-${caseItem.id}`,
      type: 'case_critical',
      reference_type: 'case',
      reference_id: caseItem.id,
      item: caseItem,
      createdAt: caseItem.updated_at,
      caseId: caseItem.id,
      isOverdue: false,
      isToday: false,
    })
  ).filter(Boolean);
}

async function getUnreviewedMovements(userId, userRole) {
  if (!supabase) throw new Error('supabase_not_configured');

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

  const filtered = (data || []).filter(m => {
    if (userRole === 'admin') return true;
    return m.cases?.conversations?.assigned_user_id === userId;
  });

  return filtered.map(movement =>
    normalizeNotification({
      id: `movement-${movement.id}`,
      type: 'process_movement',
      reference_type: 'process_movement',
      reference_id: movement.id,
      item: movement.cases || {},
      createdAt: movement.movement_date,
      movementId: movement.id,
      caseId: movement.case_id,
      isOverdue: false,
      isToday: isToday(movement.movement_date),
    })
  ).filter(Boolean);
}

async function getPendingSignatures(userId, userRole) {
  if (!supabase) throw new Error('supabase_not_configured');

  let query = supabase
    .from('document_signatures')
    .select('id, document_name, status, created_at, created_by_user_id')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);

  if (userRole !== 'admin') {
    query = query.eq('created_by_user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(sig =>
    normalizeNotification({
      id: `signature-${sig.id}`,
      type: 'signature',
      reference_type: 'signature',
      reference_id: sig.id,
      item: sig,
      createdAt: sig.created_at,
      signatureId: sig.id,
      isOverdue: false,
      isToday: isToday(sig.created_at),
    })
  ).filter(Boolean);
}

export function buildNotificationKey(notification) {
  if (!notification || !notification.type || !notification.reference_type || !notification.reference_id) {
    return null;
  }
  return `${notification.type}:${notification.reference_type}:${notification.reference_id}`;
}

export function deduplicateNotifications(notifications) {
  const seen = new Map();
  for (const n of notifications || []) {
    const key = buildNotificationKey(n);
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, n);
  }
  return Array.from(seen.values());
}

function sortNotifications(notifications) {
  const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
  return [...notifications].sort((a, b) => {
    const priorityDiff = (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

export async function aggregateNotifications({ userId, userRole, options = {} } = {}) {
  if (!userId) {
    throw new Error('missing_user_id');
  }

  const sources = [
    { name: 'messages', fn: getUnreadMessages },
    { name: 'reminders', fn: getReminders },
    { name: 'deadlines', fn: getDeadlines },
    { name: 'events', fn: getEvents },
    { name: 'cases', fn: getCriticalCases },
    { name: 'process_movements', fn: getUnreviewedMovements },
    { name: 'signatures', fn: getPendingSignatures },
  ];

  const results = await Promise.allSettled(
    sources.map(s => s.fn(userId, userRole))
  );

  const notifications = [];
  const errors = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      notifications.push(...(result.value || []));
    } else {
      errors.push(withError(sources[i].name, result.reason));
    }
  });

  const deduped = deduplicateNotifications(notifications);
  const sorted = sortNotifications(deduped);
  const countReliable = errors.length === 0;

  return { notifications: sorted, errors, countReliable };
}

export async function getVisibleNotificationsForUser({ userId, userRole }) {
  return aggregateNotifications({ userId, userRole });
}

export function getNotificationCountFromVisibleItems(notifications) {
  return (notifications || []).length;
}
