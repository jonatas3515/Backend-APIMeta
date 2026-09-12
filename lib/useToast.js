import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export const TOAST_TYPES = {
  success: 'success',
  error: 'error',
  info: 'info',
  warning: 'warning'
};

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = ++toastId;
    const safeMessage = typeof message === 'string' ? message : String(message);
    const safeType = TOAST_TYPES[type] ? type : 'info';

    setToasts((prev) => [...prev, { id, message: safeMessage, type: safeType, duration }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return { toasts: [], addToast: () => {}, removeToast: () => {} };
  }
  return context;
}
