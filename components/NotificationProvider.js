/**
 * NotificationProvider
 * Única camada responsável por chamadas de notificações entre Bell e Panel.
 * Centraliza count, list, polling, retry, cooldown, 429 e sessão expirada.
 */

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useCallback
} from 'react';
import { getAuthHeaders } from '../lib/api';
import { safeError } from '../lib/safeLogger';

const NotificationContext = createContext(null);

const initialState = {
  notifications: [],
  unreadCount: 0,
  countReliable: true,
  errors: [],
  isLoadingList: false,
  isLoadingCount: false,
  isRefreshing: false,
  rateLimited: false,
  cooldownRemaining: 0,
  authExpired: false,
  networkError: false,
  lastUpdatedAt: null
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING_LIST':
      return { ...state, isLoadingList: action.payload };
    case 'SET_LOADING_COUNT':
      return { ...state, isLoadingCount: action.payload };
    case 'SET_REFRESHING':
      return { ...state, isRefreshing: action.payload };
    case 'SET_LIST': {
      const { notifications, unreadCount, countReliable, errors, lastUpdatedAt } = action.payload;
      return {
        ...state,
        notifications: notifications || [],
        unreadCount: unreadCount || 0,
        countReliable: countReliable !== false,
        errors: errors || [],
        lastUpdatedAt: lastUpdatedAt || state.lastUpdatedAt,
        rateLimited: false,
        cooldownRemaining: 0,
        authExpired: false,
        networkError: false
      };
    }
    case 'SET_COUNT': {
      const { unreadCount, countReliable, errors, lastUpdatedAt } = action.payload;
      return {
        ...state,
        unreadCount: unreadCount || 0,
        countReliable: countReliable !== false,
        errors: errors || [],
        lastUpdatedAt: lastUpdatedAt || state.lastUpdatedAt,
        rateLimited: false,
        cooldownRemaining: 0,
        authExpired: false,
        networkError: false
      };
    }
    case 'SET_COOLDOWN': {
      const seconds = Math.max(0, Math.min(action.payload, 60));
      return {
        ...state,
        rateLimited: true,
        cooldownRemaining: seconds,
        authExpired: false,
        networkError: false
      };
    }
    case 'TICK_COOLDOWN': {
      const next = Math.max(0, state.cooldownRemaining - 1);
      return { ...state, cooldownRemaining: next, rateLimited: next > 0 };
    }
    case 'CLEAR_COOLDOWN':
      return { ...state, rateLimited: false, cooldownRemaining: 0 };
    case 'AUTH_EXPIRED':
      return {
        ...state,
        authExpired: true,
        countReliable: false,
        unreadCount: 0,
        notifications: [],
        errors: [],
        rateLimited: false,
        cooldownRemaining: 0,
        networkError: false
      };
    case 'NETWORK_ERROR':
      return {
        ...state,
        networkError: true,
        countReliable: false,
        rateLimited: false,
        authExpired: false
      };
    default:
      return state;
  }
}

function getRetryAfter(response, fallback = 3) {
  const header = response.headers?.get ? response.headers.get('Retry-After') : null;
  if (header && !Number.isNaN(Number(header))) {
    return Math.max(0, Math.ceil(Number(header)));
  }
  try {
    const data = JSON.parse(response.headers?.get ? response.headers.get('x-retry-after') : '{}');
    if (typeof data.retryAfterSeconds === 'number') return data.retryAfterSeconds;
  } catch {
    // ignore
  }
  return fallback;
}

export function NotificationProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const listControllerRef = useRef(null);
  const countControllerRef = useRef(null);
  const pendingListRef = useRef(null);
  const pendingCountRef = useRef(null);
  const cooldownIntervalRef = useRef(null);
  const isMountedRef = useRef(true);
  const panelOpenRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (state.cooldownRemaining === 0 && cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }
  }, [state.cooldownRemaining]);

  const startCooldown = useCallback((seconds) => {
    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }
    dispatch({ type: 'SET_COOLDOWN', payload: seconds });
    cooldownIntervalRef.current = setInterval(() => {
      if (!isMountedRef.current) {
        clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
        return;
      }
      const current = stateRef.current.cooldownRemaining;
      if (current <= 1) {
        dispatch({ type: 'CLEAR_COOLDOWN' });
      } else {
        dispatch({ type: 'TICK_COOLDOWN' });
      }
    }, 1000);
  }, []);

  const handleResponse = useCallback(async (response, type) => {
    if (response.status === 429) {
      const seconds = getRetryAfter(response, 3);
      startCooldown(seconds);
      return;
    }
    if (response.status === 401 || response.status === 403) {
      dispatch({ type: 'AUTH_EXPIRED' });
      return;
    }
    if (!response.ok) {
      dispatch({ type: 'NETWORK_ERROR' });
      return;
    }
    const data = await response.json();
    const lastUpdatedAt = new Date().toISOString();
    if (type === 'list') {
      dispatch({
        type: 'SET_LIST',
        payload: {
          notifications: data.notifications,
          unreadCount: data.unreadCount,
          countReliable: data.countReliable,
          errors: data.errors,
          lastUpdatedAt
        }
      });
    } else {
      dispatch({
        type: 'SET_COUNT',
        payload: {
          unreadCount: data.unreadCount,
          countReliable: data.countReliable,
          errors: data.errors,
          lastUpdatedAt
        }
      });
    }
  }, [startCooldown]);

  const fetchNotificationCount = useCallback(async () => {
    if (
      !isMountedRef.current ||
      panelOpenRef.current ||
      stateRef.current.rateLimited ||
      stateRef.current.authExpired
    ) {
      return Promise.resolve();
    }
    if (pendingCountRef.current) return pendingCountRef.current;

    const controller = new AbortController();
    countControllerRef.current = controller;
    dispatch({ type: 'SET_LOADING_COUNT', payload: true });

    const promise = (async () => {
      try {
        const response = await fetch('/api/notifications/count', {
          headers: await getAuthHeaders(),
          signal: controller.signal
        });
        if (!isMountedRef.current) return;
        await handleResponse(response, 'count');
      } catch (err) {
        if (err.name === 'AbortError' || !isMountedRef.current) return;
        safeError('notification_count_error', err, { component: 'NotificationProvider' });
        dispatch({ type: 'NETWORK_ERROR' });
      } finally {
        if (isMountedRef.current) {
          dispatch({ type: 'SET_LOADING_COUNT', payload: false });
        }
        pendingCountRef.current = null;
        countControllerRef.current = null;
      }
    })();

    pendingCountRef.current = promise;
    return promise;
  }, [handleResponse]);

  const refreshNotifications = useCallback(async ({ force = false } = {}) => {
    if (!isMountedRef.current || stateRef.current.authExpired) return Promise.resolve();
    if (pendingListRef.current) return pendingListRef.current;

    const controller = new AbortController();
    listControllerRef.current = controller;
    dispatch({ type: 'SET_LOADING_LIST', payload: true });
    if (force) dispatch({ type: 'SET_REFRESHING', payload: true });

    const promise = (async () => {
      try {
        const url = force ? '/api/notifications?refresh=1' : '/api/notifications';
        const response = await fetch(url, {
          headers: await getAuthHeaders(),
          signal: controller.signal
        });
        if (!isMountedRef.current) return;
        await handleResponse(response, 'list');
      } catch (err) {
        if (err.name === 'AbortError' || !isMountedRef.current) return;
        safeError('notifications_refresh_error', err, { component: 'NotificationProvider' });
        dispatch({ type: 'NETWORK_ERROR' });
      } finally {
        if (isMountedRef.current) {
          dispatch({ type: 'SET_LOADING_LIST', payload: false });
          if (force) dispatch({ type: 'SET_REFRESHING', payload: false });
        }
        pendingListRef.current = null;
        listControllerRef.current = null;
      }
    })();

    pendingListRef.current = promise;
    return promise;
  }, [handleResponse]);

  const openPanel = useCallback(() => {
    panelOpenRef.current = true;
    if (
      !stateRef.current.isLoadingList &&
      !stateRef.current.rateLimited &&
      !stateRef.current.authExpired
    ) {
      refreshNotifications({ force: false });
    }
  }, [refreshNotifications]);

  const closePanel = useCallback(() => {
    panelOpenRef.current = false;
  }, []);

  useEffect(() => {
    const run = () => {
      if (
        document.hidden ||
        panelOpenRef.current ||
        stateRef.current.rateLimited ||
        stateRef.current.authExpired ||
        stateRef.current.isLoadingCount
      ) {
        return;
      }
      fetchNotificationCount();
    };

    fetchNotificationCount();
    const interval = setInterval(run, 30000);

    const handleVisibility = () => {
      if (!document.hidden) run();
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (countControllerRef.current) {
        countControllerRef.current.abort();
        countControllerRef.current = null;
      }
      if (listControllerRef.current) {
        listControllerRef.current.abort();
        listControllerRef.current = null;
      }
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
    };
  }, [fetchNotificationCount]);

  const value = {
    ...state,
    refreshNotifications,
    fetchNotificationCount,
    openPanel,
    closePanel
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

function createFallbackState() {
  return {
    ...initialState,
    refreshNotifications: () => Promise.resolve(),
    fetchNotificationCount: () => Promise.resolve(),
    openPanel: () => {},
    closePanel: () => {}
  };
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  return ctx || createFallbackState();
}
