import { useEffect, useState } from 'react';

export default function WhatsAppMessageInput({ conversationId, onSent }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [variables, setVariables] = useState({});
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    fetch('/api/whatsapp/templates')
      .then(r => r.json())
      .then(data => setTemplates(data || []))
      .catch(() => setTemplates([]));
  }, []);

  function selectTemplate(id) {
    const t = templates.find(tm => tm.id === id);
    if (!t) {
      setSelectedTemplate(null);
      setVariables({});
      return;
    }
    setSelectedTemplate(t);
    const initial = {};
    (t.variables || []).forEach(v => { initial[v] = ''; });
    setVariables(initial);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (selectedTemplate && (selectedTemplate.variables || []).some(v => !variables[v])) {
      setError('Preencha todas as variáveis do template');
      return;
    }
    if (!selectedTemplate && !text.trim()) return;

    setLoading(true);
    setError(null);

    const body = selectedTemplate
      ? {
          to: 'conversation',
          type: 'template',
          templateId: selectedTemplate.id,
          variables,
          clientId: conversationId
        }
      : {
          to: 'conversation',
          type: 'text',
          content: text.trim(),
          clientId: conversationId
        };

    try {
      const response = await fetch('/api/whatsapp/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Erro ao enviar mensagem');
      }

      setText('');
      setSelectedTemplate(null);
      setVariables({});
      onSent?.();
    } catch (err) {
      setError(err.message || 'Erro ao enviar mensagem');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-nc-gray-200 space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="whatsapp-message" className="sr-only">Mensagem</label>
          <input
            id="whatsapp-message"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading || selectedTemplate}
            placeholder={selectedTemplate ? 'Usando template' : 'Digite uma mensagem...'}
            className="nc-input text-xs w-full"
            aria-label="Digite uma mensagem para enviar pelo WhatsApp"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowTemplates(!showTemplates)}
          className="nc-btn text-xs py-1.5"
          aria-label="Selecionar template"
        >
          {showTemplates ? 'Fechar' : 'Usar Template'}
        </button>

        <button
          type="submit"
          disabled={loading || (!selectedTemplate && !text.trim())}
          className="nc-btn-primary text-xs py-1.5 disabled:opacity-50"
          aria-label="Enviar mensagem pelo WhatsApp"
        >
          {loading ? 'Enviando...' : 'Enviar'}
        </button>
      </div>

      {showTemplates && (
        <div className="border border-nc-gray-200 rounded p-2 bg-nc-surface">
          <label htmlFor="template-select" className="text-xs text-nc-text-secondary">Template</label>
          <select
            id="template-select"
            value={selectedTemplate ? selectedTemplate.id : ''}
            onChange={(e) => selectTemplate(e.target.value)}
            className="nc-input text-xs w-full mt-1"
          >
            <option value="">-- Selecione --</option>
            {templates.filter(t => t.status === 'approved').map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          {selectedTemplate && selectedTemplate.variables && selectedTemplate.variables.map(v => (
            <div key={v} className="mt-2">
              <label htmlFor={`var-${v}`} className="text-xs text-nc-text-secondary">{'Variável {{' + v + '}}'}</label>
              <input
                id={`var-${v}`}
                type="text"
                value={variables[v] || ''}
                onChange={(e) => setVariables({ ...variables, [v]: e.target.value })}
                className="nc-input text-xs w-full mt-1"
              />
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600" role="alert">{error}</p>
      )}
    </form>
  );
}
