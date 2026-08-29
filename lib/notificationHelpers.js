/**
 * Notification Helpers
 * Funções para sanitização, priorização e roteamento de notificações
 * SEGURANÇA: Nenhuma PII deve ser exposta em títulos ou prévias
 */

import { buildInternalUrl } from './router';

function containsPII(id) {
  const piiPatterns = [
    /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,      // CPF
    /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/, // CNPJ
    /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/, // CNJ
    /\S+@\S+\.\S+/,                          // e-mail
    /\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}/   // telefone
  ];
  return piiPatterns.some(p => p.test(id));
}

function isValidReferenceId(id) {
  if (typeof id !== 'string' || !id.trim()) return false;
  if (id.length > 100) return false;
  // Evita PII simples, redirecionamentos e estruturas de caminho
  const lower = id.toLowerCase();
  if (lower.includes('http:') || lower.includes('https:') || lower.includes('javascript:') || lower.includes('data:')) return false;
  if (lower.includes('/') || lower.includes('\\') || lower.includes('..')) return false;
  if (/^[\s\d]+$/.test(id.trim())) return false;
  if (containsPII(id)) return false;
  return true;
}

/**
 * Sanitiza título de notificação removendo qualquer PII
 * @param {Object} item - Item da fonte de dados
 * @param {String} type - Tipo de notificação
 * @returns {String} Título seguro sem PII
 */
export function sanitizeNotificationTitle(item, type) {
  // Validar item
  const safeItem = item || {};
  
  const safeTitles = {
    message: 'Nova mensagem',
    deadline: `Prazo de caso ${safeItem.legal_area || 'jurídico'}`,
    deadline_overdue: `Prazo vencido - ${safeItem.legal_area || 'Caso jurídico'}`,
    deadline_today: `Prazo hoje - ${safeItem.legal_area || 'Caso jurídico'}`,
    reminder: 'Lembrete pendente',
    reminder_overdue: 'Lembrete vencido',
    event: `Evento ${safeItem.legal_area ? `- ${safeItem.legal_area}` : 'jurídico'}`,
    event_today: `Evento hoje ${safeItem.legal_area ? `- ${safeItem.legal_area}` : ''}`,
    case_critical: `Caso ${safeItem.legal_area || 'jurídico'} - Alta prioridade`,
    process_movement: 'Nova movimentação processual',
    signature: 'Assinatura pendente'
  };

  // Adiciona município se disponível e não sensível
  let title = safeTitles[type] || 'Notificação';
  
  if (safeItem.municipality && !['message', 'signature'].includes(type.split('_')[0])) {
    title += ` - ${safeItem.municipality}`;
  }

  return title;
}

/**
 * Define prioridade da notificação
 * @param {Object} item - Item da fonte de dados
 * @param {String} type - Tipo de notificação
 * @returns {String} 'critical' | 'high' | 'normal' | 'low'
 */
export function prioritizeNotification(item, type) {
  // Crítico: vencido ou hoje
  if (type.includes('overdue')) return 'critical';
  if (type.includes('today')) return 'critical';
  
  // Alta prioridade
  if (type === 'case_critical') return 'high';
  if (type === 'process_movement') return 'high';
  if (type === 'signature') return 'high';
  if (item.priority === 'alta') return 'high';
  
  // Normal
  if (type === 'message') return 'normal';
  if (type === 'reminder') return 'normal';
  
  // Baixa
  return 'low';
}

/**
 * Gera rota segura para o módulo de origem
 * @param {Object} notification - Notificação
 * @returns {String|null} Rota interna segura ou null
 */
export function getNotificationRoute(notification) {
  const {
    type,
    reference_id,
    reference_type,
    caseId,
    conversationId,
    eventId,
    movementId,
    processId,
    signatureId,
    reminderId,
  } = notification || {};

  if (!type || !reference_id || !reference_type) {
    return null;
  }

  switch (type) {
    case 'message':
      return buildInternalUrl({ tab: 'chat', conversationId: reference_id });
    case 'reminder':
    case 'reminder_overdue':
      // Ordem: id explícito da entidade primeiro; depois reference_id se o tipo bater
      if (isValidReferenceId(conversationId)) {
        return buildInternalUrl({ tab: 'chat', conversationId, reminderId: reference_id });
      }
      if (reference_type === 'conversation' && isValidReferenceId(reference_id)) {
        return buildInternalUrl({ tab: 'chat', conversationId: reference_id, reminderId: reference_id });
      }
      if (isValidReferenceId(caseId)) {
        return buildInternalUrl({ tab: 'cases', caseId, reminderId: reference_id });
      }
      if (reference_type === 'case' && isValidReferenceId(reference_id)) {
        return buildInternalUrl({ tab: 'cases', caseId: reference_id, reminderId: reference_id });
      }
      if (isValidReferenceId(eventId)) {
        return buildInternalUrl({ tab: 'agenda', eventId, reminderId: reference_id });
      }
      if (reference_type === 'event' && isValidReferenceId(reference_id)) {
        return buildInternalUrl({ tab: 'agenda', eventId: reference_id, reminderId: reference_id });
      }
      // Nenhum fallback para Chat: referência ambígua gera notificação sem link
      return null;
    case 'deadline':
    case 'deadline_today':
    case 'deadline_overdue':
    case 'case_critical':
      return buildInternalUrl({ tab: 'cases', caseId: reference_id });
    case 'event':
    case 'event_today':
      return buildInternalUrl({ tab: 'agenda', eventId: reference_id });
    case 'process_movement':
      return buildInternalUrl({ tab: 'triage', movementId: reference_id, caseId, processId });
    case 'signature':
      return buildInternalUrl({ tab: 'users', view: 'signatures', signatureId: reference_id });
    default:
      return null;
  }
}

/**
 * Formata data relativa (ex: "há 2 horas", "vence hoje")
 * @param {String|Date} date - Data
 * @param {String} context - 'past' | 'future'
 * @returns {String} Data formatada
 */
export function formatRelativeDate(date, context = 'past') {
  const now = new Date();
  const target = new Date(date);
  const diffMs = context === 'past' ? now - target : target - now;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  // Diferença em dias do calendário para evitar erros de arredondamento
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const calendarDiffMs = startOfTarget - startOfNow;
  const calendarDiffDays = Math.round(calendarDiffMs / (24 * 60 * 60 * 1000));

  if (context === 'future') {
    if (calendarDiffDays === 0) return 'hoje';
    if (calendarDiffDays === 1) return 'amanhã';
    if (calendarDiffDays < 7) return `em ${calendarDiffDays} dias`;
    return target.toLocaleDateString('pt-BR');
  }

  // Past
  if (diffSecs < 60) return 'agora';
  if (diffMins < 60) return `há ${diffMins} min`;
  if (diffHours < 24) return `há ${diffHours}h`;
  if (calendarDiffDays === -1) return 'ontem';
  if (calendarDiffDays > -7) return `há ${Math.abs(calendarDiffDays)} dias`;
  return target.toLocaleDateString('pt-BR');
}

/**
 * Verifica se data é hoje
 * @param {String|Date} date - Data
 * @returns {Boolean}
 */
export function isToday(date) {
  const today = new Date();
  const target = new Date(date);
  return today.toDateString() === target.toDateString();
}

/**
 * Verifica se data está vencida
 * @param {String|Date} date - Data
 * @returns {Boolean}
 */
export function isOverdue(date) {
  const now = new Date();
  const target = new Date(date);
  return target < now;
}

/**
 * Agrupa notificações por categoria
 * @param {Array} notifications - Lista de notificações
 * @returns {Object} { critical: [], today: [], upcoming: [], updates: [] }
 */
export function groupNotifications(notifications) {
  const groups = {
    critical: [],
    today: [],
    upcoming: [],
    updates: []
  };

  notifications.forEach(notif => {
    if (notif.priority === 'critical') {
      groups.critical.push(notif);
    } else if (notif.isToday) {
      groups.today.push(notif);
    } else if (['process_movement', 'signature'].includes(notif.type)) {
      groups.updates.push(notif);
    } else {
      groups.upcoming.push(notif);
    }
  });

  return groups;
}

/**
 * Formata contagem para badge (cap em 99+)
 * @param {Number} count - Contagem
 * @returns {String} Contagem formatada
 */
export function formatBadgeCount(count) {
  if (count === 0) return '';
  if (count > 99) return '99+';
  return count.toString();
}

/**
 * Valida se título não contém PII
 * @param {String} title - Título
 * @returns {Boolean} true se seguro
 */
export function validateNoPII(title) {
  if (typeof title !== 'string' || title.length > 200) {
    return false;
  }

  const patterns = {
    cpf: /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/,
    phone: /\(\d{2}\)\s?\d{4,5}-?\d{4}/,
    email: /[^@\s]+@[^@\s]+\.[^@\s]+/,
    url: /https?:\/\//,
  };

  const safeTerms = [
    'São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Porto Alegre',
    'Caso Trabalhista', 'Caso Previdenciário', 'Caso Cível', 'Caso Criminal',
    'Direito Trabalhista', 'Direito Previdenciário', 'Direito Cível'
  ];

  for (const pattern of Object.values(patterns)) {
    if (pattern.test(title)) return false;
  }

  const fullNamePattern = /\b[A-ZÀÁÂÃÉÊÍÓÔÕÚÇ][a-zàáâãéêíóôõúç]{2,}\s+[A-ZÀÁÂÃÉÊÍÓÔÕÚÇ][a-zàáâãéêíóôõúç]{2,}\b/;
  const matches = title.match(fullNamePattern);

  if (matches) {
    const isSafeTerm = safeTerms.some(term => matches[0].includes(term) || term.includes(matches[0]));
    if (!isSafeTerm) return false;
  }

  return true;
}

/**
 * Valida se uma rota de notificação é interna e segura
 * @param {String} url - URL a validar
 * @returns {Boolean} true se segura
 */
export function validateInternalNotificationRoute(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.length > 500) return false;
  if (!url.startsWith('/?') && url !== '/') return false;

  const lower = url.toLowerCase();
  if (
    lower.includes('http:') ||
    lower.includes('https:') ||
    lower.includes('javascript:') ||
    lower.includes('data:') ||
    lower.includes('//')
  ) {
    return false;
  }

  if (/[<>{}|\\^`]/.test(url)) return false;

  const piiPatterns = [
    /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/,
    /\d{2}[-.\s]?\d{5}[-.\s]?\d{4}/,
    /[^@\s]+@[^@\s]+\.[^@\s]+/,
  ];

  for (const pattern of piiPatterns) {
    if (pattern.test(url)) return false;
  }

  const dangerousKeys = ['token', 'api_key', 'apikey', 'signature', 'storage_path', 'password', 'secret', 'auth'];
  const queryStart = url.indexOf('?');
  if (queryStart !== -1) {
    const query = url.slice(queryStart + 1);
    const pairs = query.split('&');
    for (const pair of pairs) {
      const [key] = pair.split('=');
      const decoded = decodeURIComponent(key || '').toLowerCase();
      if (dangerousKeys.includes(decoded)) return false;
    }
  }

  return true;
}

/**
 * Define o grupo de exibição da notificação
 * @param {Object} n - Notificação
 * @returns {String} critical | today | upcoming | updates
 */
export function computeNotificationGroup({ type, isOverdue, isToday, priority }) {
  if (priority === 'critical' || isOverdue) return 'critical';
  if (isToday) return 'today';
  if (['process_movement', 'signature'].includes(type)) return 'updates';
  return 'upcoming';
}

/**
 * Normaliza um item bruto para o contrato de notificação
 * @param {Object} raw - Item bruto
 * @returns {Object|null} Notificação normalizada ou null se invalida
 */
export function normalizeNotification(raw) {
  if (!raw || !raw.type || !raw.reference_type || !raw.reference_id) {
    return null;
  }

  const {
    type,
    reference_type,
    reference_id,
    item,
    createdAt,
    readAt,
    caseId,
    conversationId,
    eventId,
    movementId,
    processId,
    signatureId,
    reminderId,
  } = raw;

  const safeItem = item || {};

  const dateValue = createdAt ||
    safeItem.deadline_date ||
    safeItem.scheduled_for ||
    safeItem.event_date ||
    safeItem.movement_date ||
    safeItem.updated_at ||
    safeItem.created_at;

  const isOverdueFlag = raw.isOverdue !== undefined ? raw.isOverdue : isOverdue(dateValue);
  const isTodayFlag = raw.isToday !== undefined ? raw.isToday : isToday(dateValue);

  const title = raw.title && typeof raw.title === 'string'
    ? raw.title
    : sanitizeNotificationTitle(safeItem, type);

  const priority = raw.priority && typeof raw.priority === 'string'
    ? raw.priority
    : prioritizeNotification(safeItem, type);

  const link = getNotificationRoute({
    type,
    reference_type,
    reference_id,
    caseId,
    conversationId,
    eventId,
    movementId,
    processId,
    signatureId,
    reminderId,
  });

  if (!validateInternalNotificationRoute(link)) {
    return null;
  }

  const notification = {
    id: raw.id || `${type}-${reference_id}`,
    type,
    reference_type,
    reference_id,
    title,
    priority,
    group: computeNotificationGroup({ type, isOverdue: isOverdueFlag, isToday: isTodayFlag, priority }),
    isUnread: !readAt,
    isOverdue: !!isOverdueFlag,
    isToday: !!isTodayFlag,
    createdAt: createdAt || safeItem.created_at || safeItem.updated_at || new Date().toISOString(),
    link,
  };

  if (!validateNoPII(notification.title)) {
    return null;
  }

  return notification;
}

export const NOTIFICATION_ACTION_LABELS = {
  message: 'Abrir conversa',
  reminder: 'Ver lembrete',
  reminder_overdue: 'Ver lembrete',
  deadline: 'Ver caso',
  deadline_today: 'Ver caso',
  deadline_overdue: 'Ver caso',
  event: 'Ver agenda',
  event_today: 'Ver agenda',
  case_critical: 'Ver caso',
  process_movement: 'Abrir triagem',
  signature: 'Ver assinatura'
};

export function getNotificationActionLabel(type) {
  return NOTIFICATION_ACTION_LABELS[type] || 'Ver';
}
