import { useState } from 'react';

const CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
const STATUSES = ['draft', 'approved'];

export default function WhatsAppTemplateForm({ onSuccess, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    category: 'UTILITY',
    content: '',
    variables: '',
    status: 'draft'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const variables = form.variables
      .split(',')
      .map(v => v.trim())
      .filter(v => /^\d+$/.test(v));

    try {
      const response = await fetch('/api/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          content: form.content,
          variables,
          status: form.status
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Erro ao cadastrar template');
      }

      setLoading(false);
      onSuccess();
    } catch (err) {
      setLoading(false);
      setError(err.message || 'Erro ao cadastrar template');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-nc-gray-200 rounded p-4 space-y-3 text-sm">
      <p className="font-bold text-nc-text-title">Novo Template</p>

      <div>
        <label htmlFor="template-name" className="block text-xs text-nc-text-secondary mb-1">Nome</label>
        <input
          id="template-name"
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="nc-input text-xs w-full"
          pattern="^[a-zA-Z0-9_]+$"
          required
        />
      </div>

      <div>
        <label htmlFor="template-category" className="block text-xs text-nc-text-secondary mb-1">Categoria</label>
        <select
          id="template-category"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="nc-input text-xs w-full"
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor="template-content" className="block text-xs text-nc-text-secondary mb-1">Conteúdo</label>
        <textarea
          id="template-content"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          className="nc-input text-xs w-full"
          rows="3"
          maxLength="1000"
          required
        />
        <p className="text-[10px] text-nc-text-muted mt-1">{'Use {{1}}, {{2}}... para variáveis'}</p>
      </div>

      <div>
        <label htmlFor="template-variables" className="block text-xs text-nc-text-secondary mb-1">Variáveis (ex: 1,2,3)</label>
        <input
          id="template-variables"
          type="text"
          value={form.variables}
          onChange={(e) => setForm({ ...form, variables: e.target.value })}
          className="nc-input text-xs w-full"
          placeholder="1,2,3"
        />
      </div>

      <div>
        <label htmlFor="template-status" className="block text-xs text-nc-text-secondary mb-1">Status</label>
        <select
          id="template-status"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          className="nc-input text-xs w-full"
        >
          {STATUSES.map(s => <option key={s} value={s}>{s === 'approved' ? 'Aprovado' : 'Rascunho'}</option>)}
        </select>
      </div>

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs" role="alert">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="nc-btn-primary text-xs py-1.5 flex-1 disabled:opacity-50"
        >
          {loading ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="nc-btn text-xs py-1.5"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
