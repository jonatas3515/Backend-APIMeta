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
  // Regex para detectar PII
  const patterns = {
    cpf: /\d{3}\.\d{3}\.\d{3}-\d{2}/,
    phone: /\(\d{2}\)\s?\d{4,5}-?\d{4}/,
    email: /@/,
    url: /https?:\/\//,
  };

  // Lista de exceções (cidades, termos jurídicos comuns)
  const safeTerms = [
    'São Paulo', 'Rio Janeiro', 'Belo Horizonte', 'Porto Alegre',
    'Caso Trabalhista', 'Caso Previdenciário', 'Caso Cível', 'Caso Criminal',
    'Direito Trabalhista', 'Direito Previdenciário', 'Direito Cível'
  ];

  // Verifica padrões simples primeiro
  for (const [key, pattern] of Object.entries(patterns)) {
    if (pattern.test(title)) {
      console.error(`[NOTIFICATION] PII detectada no título: ${key}`);
      return false;
    }
  }

  // Verifica nome completo (2+ palavras capitalizadas)
  // mas exclui termos seguros conhecidos
  const fullNamePattern = /\b[A-ZÀÁÂÃÉÊÍÓÔÕÚÇ][a-zàáâãéêíóôõúç]{2,}\s+[A-ZÀÁÂÃÉÊÍÓÔÕÚÇ][a-zàáâãéêíóôõúç]{2,}\b/;
  const matches = title.match(fullNamePattern);

  if (matches) {
    // Verifica se o match não está na lista de exceções
    const isSafeTerm = safeTerms.some(term => matches[0].includes(term) || term.includes(matches[0]));
    if (!isSafeTerm) {
      console.error(`[NOTIFICATION] PII detectada no título: fullName`);
      return false;
    }
  }

  return true;
}
