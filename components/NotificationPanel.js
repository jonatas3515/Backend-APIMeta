/**
 * NotificationPanel - Painel de notificações
 * Desktop: dropdown via portal | Mobile: fullscreen overlay
 * Consome estado e ações do NotificationProvider.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import NotificationItem from './NotificationItem';
import Portal from './Portal';
import {
  groupNotifications,
  validateInternalNotificationRoute,
  getSafeSourceLabels
} from '../lib/notificationHelpers';
import { useRouter } from 'next/router';
import { useNotifications } from './NotificationProvider';

export default function NotificationPanel(props) {
  const { isOpen, onClose, triggerRef } = props;

  const {
    notifications,
    unreadCount,
    countReliable,
    errors,
    isLoadingList,
    isRefreshing,
    rateLimited,
    cooldownRemaining,
    authExpired,
    networkError,
    refreshNotifications,
    openPanel,
    closePanel
  } = useNotifications();

  const [activeGroup, setActiveGroup] = useState('all');
  const [isMobile, setIsMobile] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 400 });
  const panelRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    if (isOpen) {
      openPanel();
    } else {
      closePanel();
    }
    return () => {
      if (!isOpen) closePanel();
    };
  }, [isOpen, openPanel, closePanel]);

  // Detectar mobile e calcular posição
  useEffect(() => {
    const updatePosition = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      if (!mobile && triggerRef?.current && isOpen) {
        const triggerRect = triggerRef.current.getBoundingClientRect();
        const viewportPadding = 8;
        const panelWidth = Math.min(400, window.innerWidth - viewportPadding * 2);

        let left = triggerRect.right - panelWidth;
        if (left < viewportPadding) left = viewportPadding;
        if (left + panelWidth > window.innerWidth - viewportPadding) {
          left = window.innerWidth - panelWidth - viewportPadding;
        }

        const top = triggerRect.bottom + 8;

        setPosition({ top, left, width: panelWidth });
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, triggerRef]);

  // Fechar ao clicar fora (desktop) e Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (isMobile) return;
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        if (triggerRef?.current && !triggerRef.current.contains(event.target)) {
          onClose();
        }
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, isMobile, onClose, triggerRef]);

  // Ação: Ver notificação (abre origem e fecha painel)
  const handleAction = async (notification) => {
    if (notification.link && validateInternalNotificationRoute(notification.link)) {
      onClose();
      await router.push(notification.link);
    }
  };

  const handleRetry = useCallback(() => {
    if (isLoadingList || isRefreshing || rateLimited) return;
    refreshNotifications({ force: true });
  }, [isLoadingList, isRefreshing, rateLimited, refreshNotifications]);

  if (!isOpen) return null;

  const grouped = groupNotifications(notifications);
  const groups = {
    all: notifications,
    critical: grouped.critical,
    today: grouped.today,
    upcoming: grouped.upcoming,
    updates: grouped.updates
  };

  const currentNotifications = groups[activeGroup] || [];
  const partialSourceLabels = getSafeSourceLabels(errors);

  const renderAlert = () => {
    if (authExpired) {
      return (
        <div
          className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2"
          role="alert"
          data-testid="auth-expired-message"
        >
          <p>Sua sessão expirou. Entre novamente.</p>
        </div>
      );
    }
    if (networkError) {
      return (
        <div
          className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2"
          role="alert"
          data-testid="network-error-message"
        >
          <p className="mb-1">Não foi possível atualizar as notificações. Tente novamente.</p>
          <button
            onClick={handleRetry}
            disabled={isLoadingList || isRefreshing}
            className="text-xs font-medium text-red-800 hover:text-red-900 underline disabled:opacity-50 disabled:no-underline"
          >
            {isLoadingList || isRefreshing ? 'Atualizando...' : 'Atualizar agora'}
          </button>
        </div>
      );
    }
    if (rateLimited) {
      const label = cooldownRemaining > 0
        ? `Atualizar novamente em ${cooldownRemaining} s.`
        : 'Atualizar agora';
      return (
        <div
          className="mb-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2"
          role="status"
          aria-live="polite"
          data-testid="rate-limit-warning"
        >
          <p className="mb-1">Aguarde alguns segundos antes de atualizar novamente.</p>
          <button
            onClick={handleRetry}
            disabled={cooldownRemaining > 0 || isLoadingList || isRefreshing}
            className="text-xs font-medium text-yellow-800 hover:text-yellow-900 underline disabled:opacity-50 disabled:no-underline"
            data-testid="retry-button"
          >
            {isLoadingList || isRefreshing ? 'Atualizando...' : label}
          </button>
        </div>
      );
    }
    if (!countReliable) {
      return (
        <div
          className="mb-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2"
          role="status"
          aria-live="polite"
          data-testid="partial-warning"
        >
          <p className="mb-1">Algumas atualizações estão indisponíveis no momento.</p>
          {partialSourceLabels && (
            <p className="mb-1" data-testid="partial-categories">{partialSourceLabels}</p>
          )}
          <button
            onClick={handleRetry}
            disabled={isLoadingList || isRefreshing}
            className="text-xs font-medium text-yellow-800 hover:text-yellow-900 underline disabled:opacity-50 disabled:no-underline"
            data-testid="retry-button"
          >
            {isLoadingList || isRefreshing ? 'Atualizando...' : 'Atualizar agora'}
          </button>
        </div>
      );
    }
    return null;
  };

  const panelContent = (
    <>
      {/* Backdrop (mobile) */}
      {isMobile && (
        <div
          className="fixed inset-0 bg-black/30 z-[999]"
          onClick={onClose}
          data-testid="backdrop"
        />
      )}

      {/* Painel */}
      <div
        ref={panelRef}
        className={`
          ${isMobile
            ? 'fixed inset-0 z-[1000] bg-white'
            : 'fixed bg-white rounded-lg shadow-2xl border border-nc-gray-200 z-[1000]'
          }
          flex flex-col
        `}
        style={!isMobile ? {
          top: `${position.top}px`,
          left: `${position.left}px`,
          width: `${position.width}px`,
          maxHeight: `min(680px, calc(100vh - ${position.top + 16}px))`,
          boxSizing: 'border-box'
        } : {
          width: '100vw',
          height: '100dvh',
          maxWidth: 'none',
          maxHeight: 'none'
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-nc-gray-200 p-4">
          {renderAlert()}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-nc-text-title">
              🔔 Notificações {countReliable && unreadCount > 0 && `(${unreadCount})`}
              {!countReliable && !rateLimited && !authExpired && !networkError && (
                <span className="ml-1 text-xs text-yellow-500" title="Atualização parcial" aria-hidden="true">●</span>
              )}
            </h2>
            {isMobile && (
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-nc-gray-100 transition-colors"
                aria-label="Fechar"
              >
                ✕
              </button>
            )}
          </div>

          {/* Abas */}
          <div className="flex gap-2 overflow-x-auto">
            {[
              { key: 'critical', label: '🔴 Críticas', count: grouped.critical.length },
              { key: 'today', label: '📅 Hoje', count: grouped.today.length },
              { key: 'upcoming', label: '📋 Próximas', count: grouped.upcoming.length },
              { key: 'all', label: '📌 Todas', count: notifications.length }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveGroup(tab.key)}
                className={`
                  px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors
                  ${activeGroup === tab.key
                    ? 'bg-nc-yellow text-white'
                    : 'bg-nc-gray-100 text-nc-text-secondary hover:bg-nc-gray-200'
                  }
                `}
              >
                {tab.label} {tab.count > 0 && `(${tab.count})`}
              </button>
            ))}
          </div>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoadingList && currentNotifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-nc-text-muted">
              <div className="animate-spin text-3xl mb-2">⏳</div>
              <p className="text-sm">Carregando notificações...</p>
            </div>
          )}

          {!isLoadingList && !authExpired && !networkError && !rateLimited && currentNotifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-nc-text-muted">
              <div className="text-5xl mb-3">{notifications.length === 0 ? '🔕' : '📂'}</div>
              <p className="text-sm font-medium">
                {notifications.length === 0 ? 'Nenhuma notificação' : 'Nenhuma notificação nesta categoria'}
              </p>
              {notifications.length === 0 && countReliable && (
                <p className="text-xs mt-1" data-testid="all-caught-up">Você está em dia!</p>
              )}
              {notifications.length === 0 && !countReliable && (
                <p className="text-xs mt-1" data-testid="count-unavailable">Contagem temporariamente indisponível.</p>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={() => setActiveGroup('all')}
                  className="mt-2 text-xs font-medium text-nc-yellow hover:text-nc-yellow-dark"
                >
                  Ver todas as notificações
                </button>
              )}
            </div>
          )}

          {!isLoadingList && currentNotifications.length > 0 && (
            <div className="space-y-3">
              {currentNotifications.map(notification => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onAction={handleAction}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer (opcional) */}
        {!isLoadingList && !authExpired && !networkError && notifications.length > 0 && (
          <div className="flex-shrink-0 border-t border-nc-gray-200 p-3 text-center">
            <button
              onClick={onClose}
              className="text-sm text-nc-text-secondary hover:text-nc-text transition-colors"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </>
  );

  return <Portal>{panelContent}</Portal>;
}
