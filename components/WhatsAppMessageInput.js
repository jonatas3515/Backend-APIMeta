import { useState } from 'react';

export default function WhatsAppMessageInput({ conversationId, onSent }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/whatsapp/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'conversation',
          type: 'text',
          content: text.trim(),
          clientId: conversationId
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Erro ao enviar mensagem');
      }

      setText('');
      onSent?.();
    } catch (err) {
      setError(err.message || 'Erro ao enviar mensagem');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 p-3 bg-white border-t border-nc-gray-200">
      <div className="flex-1">
        <label htmlFor="whatsapp-message" className="sr-only">Mensagem</label>
        <input
          id="whatsapp-message"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
          placeholder="Digite uma mensagem..."
          className="nc-input text-xs w-full"
          aria-label="Digite uma mensagem para enviar pelo WhatsApp"
        />
      </div>

      {error && (
        <span className="text-xs text-red-600" role="alert">{error}</span>
      )}

      <button
        type="submit"
        disabled={loading || !text.trim()}
        className="nc-btn-primary text-xs py-1.5 disabled:opacity-50"
        aria-label="Enviar mensagem pelo WhatsApp"
      >
        {loading ? 'Enviando...' : 'Enviar'}
      </button>
    </form>
  );
}
