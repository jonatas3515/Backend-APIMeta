/**
 * NotificationBell - Sino de notificações com badge
 * Exibe contagem de notificações não lidas (estado vem do NotificationProvider)
 */

import { forwardRef } from 'react';
import { formatBadgeCount } from '../lib/notificationHelpers';
import { useNotifications } from './NotificationProvider';

const NotificationBell = forwardRef(({ onOpen }, ref) => {
  const { unreadCount, countReliable, rateLimited } = useNotifications();

  const handleClick = () => {
    if (onOpen) onOpen();
  };

  const badgeText = countReliable ? formatBadgeCount(unreadCount) : '!';
  const showBadge = !countReliable || unreadCount > 0;
  const badgeColor = countReliable ? 'bg-red-500' : 'bg-yellow-500';

  const ariaLabel = rateLimited
    ? `Notificações - aguarde o tempo de recarga`
    : countReliable
    ? `Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ''}`
    : 'Notificações - atualização parcial; contagem indisponível';

  return (
    <button
      ref={ref}
      onClick={handleClick}
      className="relative p-2 rounded-full hover:bg-nc-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-nc-yellow"
      aria-label={ariaLabel}
      role="button"
      title="Notificações"
      data-testid="notification-bell"
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
      {showBadge && (
        <span
          className={`absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white rounded-full ${badgeColor}`}
          data-testid="notification-badge"
        >
          {badgeText}
        </span>
      )}
    </button>
  );
});

NotificationBell.displayName = 'NotificationBell';

export default NotificationBell;
