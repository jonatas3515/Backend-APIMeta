/**
 * NotificationPanel - Painel de notificações
 * Desktop: dropdown lateral | Mobile: fullscreen overlay
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import NotificationItem from './NotificationItem';
import { groupNotifications } from '../lib/notificationHelpers';
import { useRouter } from 'next/router';

export default function NotificationPanel({ isOpen, onClose, userId, userRole }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeGroup, setActiveGroup] = useState('all');
  const [isMobile, setIsMobile] = useState(false);
  const panelRef = useRef(null);
  const router = useRouter();

  // Detectar mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Buscar notificações
  const fetchNotifications = useCallback(async () => {
    if (!userId || !isOpen) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/notifications', {
        headers: {
          'x-user-id': userId,
          'x-user-role': userRole || 'advogado'
        }
      });

      if (response.status === 429) {
        // Rate limit - não é erro crítico, apenas aguardar
        console.log('[NOTIFICATION-PANEL] Rate limit, aguardando...');
        setError(null);
        return;
      }

      if (!response.ok) {
        throw new Error(`Erro ${response.status}`);
      }

      const data = await response.json();
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error('[NOTIFICATION-PANEL] Erro:', err);
      setError('Não foi possível carregar notificações');
    } finally {
      setLoading(false);
    }
  }, [userId, userRole, isOpen]);

  // Buscar ao abrir
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Fechar ao clicar fora (desktop)
  useEffect(() => {
    if (!isOpen || isMobile) return;

    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isMobile, onClose]);

  // Ação: Ver notificação
  const handleAction = async (notification) => {
    // Navegar para o módulo correto
    if (notification.link) {
      router.push(notification.link);
      onClose();
    }
  };

  // Ação: Dispensar notificação
  const handleDismiss = async (notification) => {
    // TODO: Implementar marcação como lida via API
    // Por enquanto, apenas remove da lista local
    setNotifications(prev => prev.filter(n => n.id !== notification.id));
  };

  if (!isOpen) return null;

  // Agrupar notificações
  const grouped = groupNotifications(notifications);
  const groups = {
    all: notifications,
    critical: grouped.critical,
    today: grouped.today,
    upcoming: grouped.upcoming,
    updates: grouped.updates
  };

  const currentNotifications = groups[activeGroup] || [];
  const unreadCount = notifications.length;

  return (
    <>
      {/* Backdrop (mobile) */}
      {isMobile && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={onClose}
          data-testid="backdrop"
        />
      )}

      {/* Painel */}
      <div
        ref={panelRef}
        className={`
          ${isMobile
            ? 'fixed inset-0 z-50 bg-white'
            : 'absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-80px)] bg-white rounded-lg shadow-2xl border border-nc-gray-200 z-50'
          }
          flex flex-col
        `}
        style={!isMobile ? { right: 0 } : {}}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-nc-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-nc-text-title">
              🔔 Notificações {unreadCount > 0 && `(${unreadCount})`}
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
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-nc-text-muted">
              <div className="animate-spin text-3xl mb-2">⏳</div>
              <p className="text-sm">Carregando notificações...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <p className="text-sm text-red-700 mb-3">{error}</p>
              <button
                onClick={fetchNotifications}
                className="text-sm font-medium text-red-600 hover:text-red-700 underline"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !error && currentNotifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-nc-text-muted">
              <div className="text-5xl mb-3">🔕</div>
              <p className="text-sm font-medium">Nenhuma notificação</p>
              <p className="text-xs mt-1">Você está em dia!</p>
            </div>
          )}

          {!loading && !error && currentNotifications.length > 0 && (
            <div className="space-y-3">
              {currentNotifications.map(notification => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onAction={handleAction}
                  onDismiss={handleDismiss}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer (opcional) */}
        {!loading && !error && notifications.length > 0 && (
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
}
