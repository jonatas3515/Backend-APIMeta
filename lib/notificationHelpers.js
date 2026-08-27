/**
 * Notification Helpers
 * Funções para sanitização, priorização e roteamento de notificações
 * SEGURANÇA: Nenhuma PII deve ser exposta em títulos ou prévias
 */

/**
 * Sanitiza título de notificação removendo qualquer PII
 * @param {Object} item - Item da fonte de dados
 * @param {String} type - Tipo de notificação
 * @returns {String} Título seguro sem PII
 */
export function sanitizeNotificationTitle(item, type) {
  const safeTitles = {
    message: 'Nova mensagem',
    deadline: `Prazo de caso ${item.legal_area || 'jurídico'}`,
    deadline_overdue: `Prazo vencido - ${item.legal_area || 'Caso jurídico'}`,
    deadline_today: `Prazo hoje - ${item.legal_area || 'Caso jurídico'}`,
    reminder: 'Lembrete pendente',
    reminder_overdue: 'Lembrete vencido',
    event: `Evento ${item.legal_area ? `- ${item.legal_area}` : 'jurídico'}`,
    event_today: `Evento hoje ${item.legal_area ? `- ${item.legal_area}` : ''}`,
    case_critical: `Caso ${item.legal_area || 'jurídico'} - Alta prioridade`,
    process_movement: 'Nova movimentação processual',
    signature: 'Assinatura pendente'
  };

  // Adiciona município se disponível e não sensível
  let title = safeTitles[type] || 'Notificação';
  
  if (item.municipality && !['message', 'signature'].includes(type.split('_')[0])) {
    title += ` - ${item.municipality}`;
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
 * @returns {String} Rota segura
 */
export function getNotificationRoute(notification) {
  const { type, reference_id, reference_type } = notification;

  const routes = {
    message: `/?conversation=${reference_id}`,
    deadline: `/?case=${reference_id}`,
    deadline_overdue: `/?case=${reference_id}`,
    deadline_today: `/?case=${reference_id}`,
    reminder: `/?conversation=${reference_id}`,
    reminder_overdue: `/?conversation=${reference_id}`,
    event: `/?agenda=true&event=${reference_id}`,
    event_today: `/?agenda=true&event=${reference_id}`,
    case_critical: `/?case=${reference_id}`,
    process_movement: `/?process=${reference_id}`,
    signature: `/?signatures=true&id=${reference_id}`
  };

  return routes[type] || '/';
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
  const diffDays = Math.floor(diffHours / 24);

  if (context === 'future') {
    if (diffDays === 0) return 'hoje';
    if (diffDays === 1) return 'amanhã';
    if (diffDays < 7) return `em ${diffDays} dias`;
    return target.toLocaleDateString('pt-BR');
  }

  // Past
  if (diffSecs < 60) return 'agora';
  if (diffMins < 60) return `há ${diffMins} min`;
  if (diffHours < 24) return `há ${diffHours}h`;
  if (diffDays === 1) return 'ontem';
  if (diffDays < 7) return `há ${diffDays} dias`;
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
  // Regex para detectar PII
  const patterns = {
    cpf: /\d{3}\.\d{3}\.\d{3}-\d{2}/,
    phone: /\(\d{2}\)\s?\d{4,5}-?\d{4}/,
    email: /@/,
    url: /https?:\/\//,
    fullName: /^[A-Z][a-z]+ [A-Z][a-z]+/ // Nome completo capitalizado
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    if (pattern.test(title)) {
      console.error(`[NOTIFICATION] PII detectada no título: ${key}`);
      return false;
    }
  }

  return true;
}
