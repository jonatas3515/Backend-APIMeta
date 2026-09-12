import { useToast } from '../lib/useToast';

const TYPE_STYLES = {
  success: 'bg-green-100 text-green-800 border-green-300',
  error: 'bg-red-100 text-red-800 border-red-300',
  info: 'bg-blue-100 text-blue-800 border-blue-300',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-300'
};

export function Toast({ id, message, type, onClose }) {
  const isAlert = type === 'error' || type === 'warning';
  return (
    <div
      className={`pointer-events-auto max-w-xs w-full rounded border shadow-lg p-3 text-sm mb-2 ${TYPE_STYLES[type] || TYPE_STYLES.info}`}
      role={isAlert ? 'alert' : 'status'}
      aria-live={isAlert ? 'assertive' : 'polite'}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex-1">{message}</span>
        <button
          onClick={onClose}
          className="text-current opacity-70 hover:opacity-100"
          aria-label="Fechar notificação"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col items-end"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}

export default ToastContainer;
