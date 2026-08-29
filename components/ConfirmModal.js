import { useEffect, useRef } from 'react';

export default function ConfirmModal({
  isOpen,
  title,
  children,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  onConfirm,
  onCancel,
  loading = false,
  disabled = false,
  error = null
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event) => {
      if (event.key === 'Escape') onCancel?.();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/30"
        onClick={() => !loading && onCancel?.()}
        data-testid="confirm-modal-backdrop"
      />
      <div className="relative bg-white rounded-lg shadow-2xl border border-gray-200 w-full max-w-md p-6 mx-4">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          {title}
        </h3>

        <div className="text-sm text-gray-700 mb-6 space-y-2">
          {children}
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2" data-testid="confirm-modal-error">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={() => onCancel?.()}
            disabled={loading || disabled}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
            data-testid="confirm-modal-cancel"
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            onClick={() => onConfirm?.()}
            disabled={loading || disabled}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
            data-testid="confirm-modal-confirm"
          >
            {loading ? 'Aguarde...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
