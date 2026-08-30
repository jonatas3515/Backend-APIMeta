/**
 * NotificationBell - Sino de notificações com badge
 * Exibe contagem de notificações não lidas
 */

import { useState, useEffect, useCallback, useRef, forwardRef } from 'react';
import { formatBadgeCount } from '../lib/notificationHelpers';
import { getAuthHeaders } from '../lib/api';
import { useNotifications } from './NotificationProvider';

const NotificationBell = forwardRef(({ userId, userRole, onOpen }, ref) => {
  const { unreadCount, countReliable, isRefreshing, setSummary } = useNotifications();
  const isFetchingRef = useRef(false);
  const isRefreshingRef = useRef(isRefreshing);
  const unreadCountRef = useRef(unreadCount);
  const userIdRef = useRef(userId);
  const userRoleRef = useRef(userRole);
  const abortRef = useRef(null);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
    unreadCountRef.current = unreadCount;
    userIdRef.current = userId;
    userRoleRef.current = userRole;
  }, [isRefreshing, unreadCount, userId, userRole]);

  const fetchCount = useCallback(async (signal) => {
    if (!userIdRef.current || !userRoleRef.current || isFetchingRef.current || isRefreshingRef.current) return;
    isFetchingRef.current = true;
    try {
      const response = await fetch('/api/notifications/count', {
        headers: await getAuthHeaders(),
        signal
      });

      if (response.status === 429) {
        setSummary({ unreadCount: 0, countReliable: false, errors: [] });
        return;
      }

      if (!response.ok) {
        setSummary({ unreadCount: unreadCountRef.current, countReliable: false, errors: [] });
        return;
      }

      const data = await response.json();
      setSummary({
        unreadCount: data.unreadCount || 0,
        countReliable: data.countReliable !== false,
        errors: data.errors || []
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setSummary({ unreadCount: unreadCountRef.current, countReliable: false, errors: [] });
    } finally {
      isFetchingRef.current = false;
    }
  }, [setSummary]);

  // Buscar contagem inicial
  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Polling a cada 30s com pausa em aba oculta
  useEffect(() => {
    let interval = null;
    const run = () => {
      if (document.hidden || isRefreshingRef.current || isFetchingRef.current) return;
      const controller = new AbortController();
      abortRef.current = controller;
      fetchCount(controller.signal);
    };

    interval = setInterval(run, 30000);

    const handleVisibility = () => {
      if (document.hidden) {
        if (abortRef.current) {
          abortRef.current.abort();
          abortRef.current = null;
        }
      } else {
        run();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [fetchCount]);

  const handleClick = () => {
    if (onOpen) {
      onOpen();
    }
  };

  const badgeText = countReliable ? formatBadgeCount(unreadCount) : '!';
  const showBadge = !countReliable || unreadCount > 0;
  const badgeColor = countReliable ? 'bg-red-500' : 'bg-yellow-500';

  return (
    <button
      ref={ref}
      onClick={handleClick}
      className="relative p-2 rounded-full hover:bg-nc-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-nc-yellow"
      aria-label={`Notificações${
        countReliable && unreadCount > 0
          ? ` (${unreadCount} não lidas)`
          : countReliable
          ? ''
          : ' - atualização parcial; contagem indisponível'
      }`}
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
      {showBadge && (
        <span className={`absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white rounded-full ${badgeColor}`}>
          {badgeText}
        </span>
      )}
    </button>
  );
});

NotificationBell.displayName = 'NotificationBell';

export default NotificationBell;
