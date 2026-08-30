/**
 * NotificationProvider
 * Estado compartilhado mínimo entre o sino e o painel de notificações.
 * Sincroniza unreadCount, countReliable e estado de refresh manual.
 */

import { createContext, useContext, useState, useCallback } from 'react';

const NotificationContext = createContext(null);

function useNotificationState() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [countReliable, setCountReliable] = useState(true);
  const [errors, setErrors] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const setSummary = useCallback(({ unreadCount, countReliable, errors }) => {
    setUnreadCount(unreadCount || 0);
    setCountReliable(countReliable !== false);
    setErrors(Array.isArray(errors) ? errors : []);
  }, []);

  return {
    unreadCount,
    countReliable,
    errors,
    isRefreshing,
    setIsRefreshing,
    setSummary
  };
}

export function NotificationProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [countReliable, setCountReliable] = useState(true);
  const [errors, setErrors] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const setSummary = useCallback(({ unreadCount, countReliable, errors }) => {
    setUnreadCount(unreadCount || 0);
    setCountReliable(countReliable !== false);
    setErrors(Array.isArray(errors) ? errors : []);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        countReliable,
        errors,
        isRefreshing,
        setIsRefreshing,
        setSummary
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  const fallback = useNotificationState();
  return ctx || fallback;
}
