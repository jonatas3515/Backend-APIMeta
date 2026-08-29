/**
 * NotificationItem - Card individual de notificação
 * Exibe título seguro, data relativa e ação
 */

import { useState } from 'react';
import { formatRelativeDate, validateInternalNotificationRoute } from '../lib/notificationHelpers';

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
  critical: 'border-l-4 border-red-500 bg-red-50',
  high: 'border-l-4 border-orange-500 bg-orange-50',
  normal: 'border-l-4 border-blue-500 bg-white',
  low: 'border-l-4 border-gray-300 bg-white'
};

export default function NotificationItem({ notification, onAction, onDismiss }) {
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

  const handleDismiss = async () => {
    if (loading || !onDismiss) return;
    setLoading(true);
    try {
      await onDismiss(notification);
    } finally {
      setLoading(false);
    }
  };

  const icon = ICONS[notification.type] || '🔔';
  const priorityClass = PRIORITY_COLORS[notification.priority] || PRIORITY_COLORS.normal;
  const relativeDate = formatRelativeDate(notification.createdAt, notification.isOverdue ? 'past' : 'future');
  const hasValidLink = validateInternalNotificationRoute(notification?.link);

  // Determina se pode ser dispensada
  const canDismiss = ['message', 'process_movement', 'signature'].includes(notification.type.split('_')[0]);

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
          <h4 className="text-sm font-semibold text-nc-text truncate">
            {notification.title}
          </h4>

          {/* Data relativa */}
          <p className="text-xs text-nc-text-secondary mt-0.5">
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
            >
              {loading ? 'Carregando...' : 'Ver'}
            </button>

            {canDismiss && (
              <>
                <span className="text-nc-text-muted">•</span>
                <button
                  onClick={handleDismiss}
                  disabled={loading}
                  className="text-xs font-medium text-nc-text-secondary hover:text-nc-text disabled:opacity-50 transition-colors"
                >
                  Dispensar
                </button>
              </>
            )}
          </div>
        </div>

        {/* Badge de prioridade (opcional) */}
        {notification.priority === 'critical' && (
          <div className="flex-shrink-0">
            <span className="inline-block px-2 py-0.5 text-xs font-bold text-red-700 bg-red-100 rounded">
              Urgente
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
