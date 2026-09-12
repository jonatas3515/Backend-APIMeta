import { useEffect, useState } from 'react';
import { apiJson } from '../../lib/apiClient';
import WhatsAppTemplateList from '../../components/WhatsAppTemplateList';
import WhatsAppTemplateForm from '../../components/WhatsAppTemplateForm';

export default function WhatsAppTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);

  async function fetchTemplates() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson('/api/whatsapp/templates');
      setTemplates(data || []);
    } catch (err) {
      setError('Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function handleDelete(id) {
    if (!confirm('Confirma exclusão do template?')) return;
    try {
      await apiJson(`/api/whatsapp/templates/${id}`, { method: 'DELETE' });
      fetchTemplates();
    } catch (err) {
      setError('Erro ao excluir template');
    }
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-4">
        <h1 className="text-xl font-bold text-nc-text-title">Templates de WhatsApp</h1>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="nc-btn-primary text-xs py-1.5"
        >
          {showForm ? 'Cancelar' : 'Novo Template'}
        </button>
      </div>

      {showForm && (
        <div className="mb-4">
          <WhatsAppTemplateForm
            onSuccess={() => {
              setShowForm(false);
              fetchTemplates();
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs mb-3" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-nc-text-muted">Carregando...</p>
      ) : (
        <WhatsAppTemplateList templates={templates} onDelete={handleDelete} />
      )}
    </div>
  );
}
