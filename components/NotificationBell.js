/**
 * NotificationBell - Sino de notificações com badge
 * Exibe contagem de notificações não lidas
 */

import { useState, useEffect, useCallback } from 'react';
import { formatBadgeCount } from '../lib/notificationHelpers';

export default function NotificationBell({ userId, userRole, onOpen }) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchCount = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await fetch('/api/notifications/count', {
        headers: {
          'x-user-id': userId,
          'x-user-role': userRole || 'advogado'
        }
      });

      if (response.status === 429) {
        // Rate limit - não é erro crítico, apenas aguardar
        console.log('[NOTIFICATION-BELL] Rate limit, aguardando...');
        return;
      }

      if (!response.ok) {
        console.error('[NOTIFICATION-BELL] Erro ao buscar contagem:', response.status);
        return;
      }

      const data = await response.json();
      setCount(data.unreadCount || 0);
    } catch (error) {
      console.error('[NOTIFICATION-BELL] Erro:', error);
    }
  }, [userId, userRole]);

  // Buscar contagem inicial
  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Polling a cada 30s
  useEffect(() => {
    const interval = setInterval(fetchCount, 30000); // 30 segundos
    return () => clearInterval(interval);
  }, [fetchCount]);

  const handleClick = () => {
    if (onOpen) {
      onOpen();
    }
  };

  const badgeText = formatBadgeCount(count);

  return (
    <button
      onClick={handleClick}
      className="relative p-2 rounded-full hover:bg-nc-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-nc-yellow"
      aria-label={`Notificações${count > 0 ? ` (${count} não lidas)` : ''}`}
      role="button"
      title="Notificações"
    >
      {/* Sino */}
      <svg
        className="w-6 h-6 text-nc-text-secondary"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>

      {/* Badge */}
      {badgeText && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-red-500 rounded-full">
          {badgeText}
        </span>
      )}
    </button>
  );
}
