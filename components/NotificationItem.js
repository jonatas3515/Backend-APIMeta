/**
 * NotificationItem - Card individual de notificação
 * Exibe título seguro, data relativa e ação
 */

import { useState } from 'react';
import { formatRelativeDate, validateInternalNotificationRoute, getNotificationActionLabel } from '../lib/notificationHelpers';

const ICONS = {
  message: '💬',
  deadline: '📅',
  deadline_overdue: '🔴',
  deadline_today: '⏰',
  reminder: '⏰',
  reminder_overdue: '🔴',
  event_today: '📅',
  case_critical: '⚖️',
  process_movement: '📜',
  signature: '✍️'
};

const PRIORITY_COLORS = {
  critical: 'border-l-4 border-red-500 bg-red-950/20 text-red-200 border-t border-r border-b border-gray-800',
  high: 'border-l-4 border-amber-500 bg-amber-950/20 text-amber-200 border-t border-r border-b border-gray-800',
  normal: 'border-l-4 border-blue-500 bg-[#1E2022] text-gray-200 border-t border-r border-b border-gray-800',
  low: 'border-l-4 border-gray-600 bg-[#1E2022] text-gray-300 border-t border-r border-b border-gray-800'
};

export default function NotificationItem({ notification, onAction }) {
  const [loading, setLoading] = useState(false);

  const handleAction = async () => {
    if (loading || !onAction) return;
    setLoading(true);
    try {
      await onAction(notification);
    } finally {
      setLoading(false);
    }
  };

  const icon = ICONS[notification.type] || '🔔';
  const priorityClass = PRIORITY_COLORS[notification.priority] || PRIORITY_COLORS.normal;
  const relativeDate = formatRelativeDate(notification.createdAt, notification.isOverdue ? 'past' : 'future');
  const hasValidLink = validateInternalNotificationRoute(notification?.link);
  const actionLabel = getNotificationActionLabel(notification.type);

  return (
    <div className={`p-3 rounded-lg ${priorityClass} hover:shadow-md transition-shadow`}>
      <div className="flex items-start gap-3">
        {/* Ícone */}
        <div className="flex-shrink-0 text-2xl" aria-hidden="true">
          {icon}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 min-w-0">
          {/* Título */}
          <h4 className="text-sm font-semibold text-white font-semibold truncate">
            {notification.title}
          </h4>

          {/* Data relativa */}
          <p className="text-xs text-gray-400 mt-0.5">
            {notification.isOverdue && 'Venceu '}
            {notification.isToday && !notification.isOverdue && 'Hoje • '}
            {relativeDate}
          </p>

          {/* Ações */}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleAction}
              disabled={!hasValidLink || loading}
              className="text-xs font-medium text-nc-yellow hover:text-nc-yellow-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              data-testid="notification-action"
            >
              {loading ? 'Carregando...' : actionLabel}
            </button>
          </div>
        </div>

        {/* Badge de prioridade (opcional) */}
        {notification.priority === 'critical' && (
          <div className="flex-shrink-0">
            <span className="inline-block px-2 py-0.5 text-xs font-bold text-red-400 bg-red-500/20 border border-red-500/30 rounded-full">
              Urgente
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
