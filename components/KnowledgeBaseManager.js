import { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeaders } from '../lib/api';

const DOC_TYPES = ['modelo_peca', 'clausula', 'tese', 'checklist', 'jurisprudencia'];
const STATUS_OPTIONS = ['rascunho', 'revisado', 'aprovado'];

export default function KnowledgeBaseManager() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    title: '',
    type: 'modelo_peca',
    area: '',
    tribunal: '',
    tags: '',
    version: 'v1.0',
    content: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, [statusFilter]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const status = statusFilter === 'all' ? 'all' : statusFilter;
      const { data } = await axios.get(`/api/knowledge/documents?status=${status}`, {
        headers: await getAuthHeaders()
      });
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('[KNOWLEDGE] Erro ao listar documentos:', error);
      alert('Erro ao carregar documentos');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      title: '',
      type: 'modelo_peca',
      area: '',
      tribunal: '',
      tags: '',
      version: 'v1.0',
      content: ''
    });
    setShowForm(true);
  };

  const openEdit = async (doc) => {
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.get(`/api/knowledge/documents?id=${doc.id}`, { headers });
      const full = data.document || doc;
      setEditing(full);
      setForm({
        title: full.title || '',
        type: full.type || 'modelo_peca',
        area: full.area || '',
        tribunal: full.tribunal || '',
        tags: Array.isArray(full.tags) ? full.tags.join(', ') : '',
        version: full.version || 'v1.0',
        content: full.content || ''
      });
      setShowForm(true);
    } catch (error) {
      console.error('[KNOWLEDGE] Erro ao abrir documento:', error);
      alert('Erro ao carregar documento para revisão');
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.title || !form.type || !form.content) {
      alert('Título, tipo e conteúdo são obrigatórios.');
      return;
    }

    const payload = {
      ...form,
      area: form.area || null,
      tribunal: form.tribunal || null,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean)
    };

    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      if (editing) {
        await axios.put('/api/knowledge/documents', { ...payload, id: editing.id }, { headers });
      } else {
        await axios.post('/api/knowledge/documents', payload, { headers });
      }
      closeForm();
      fetchDocuments();
    } catch (error) {
      console.error('[KNOWLEDGE] Erro ao salvar:', error);
      alert(error.response?.data?.error || 'Erro ao salvar documento');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    if (newStatus === 'aprovado') {
      const ok = window.confirm(
        'Aprovar este documento?\n\n' +
        '⚠️ Revise anonimização, artigos e jurisprudência antes de aprovar.\n' +
        'Após a aprovação, ele passará a ser utilizado pelo Assistente IA.'
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(`Alterar status para ${newStatus}?`);
      if (!ok) return;
    }
    try {
      const headers = await getAuthHeaders();
      await axios.patch('/api/knowledge/documents', { id, status: newStatus }, { headers });
      fetchDocuments();
    } catch (error) {
      console.error('[KNOWLEDGE] Erro ao alterar status:', error);
      alert(error.response?.data?.error || 'Erro ao alterar status');
    }
  };

  const filteredDocs = documents.filter(d =>
    !search ||
    (d.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.preview || '').toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (status) => {
    const colors = {
      rascunho: 'bg-gray-100 text-gray-800',
      revisado: 'bg-yellow-100 text-yellow-800',
      aprovado: 'bg-green-100 text-green-800'
    };
    return (
      <span className={`text-xs px-2 py-1 rounded ${colors[status] || colors.rascunho}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="p-6 bg-nc-surface min-h-full">
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold">📚 Base de Conhecimento (RAG)</h2>
          <p className="text-sm text-yellow-600 mt-1">
            ⚠️ Revise anonimização, artigos e jurisprudência antes de aprovar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Buscar documento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 border rounded text-sm bg-nc-black text-nc-white"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded text-sm bg-nc-black text-nc-white"
          >
            <option value="all">Todos</option>
            <option value="rascunho">Rascunho</option>
            <option value="revisado">Revisado</option>
            <option value="aprovado">Aprovado</option>
          </select>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            + Novo Documento
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-6 p-4 border rounded bg-nc-black text-nc-white">
          <h3 className="text-lg font-bold mb-4">
            {editing ? 'Revisar versão anonimizada' : 'Novo Documento (será salvo como rascunho)'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <input
              type="text"
              placeholder="Título"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="px-3 py-2 border rounded text-black"
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="px-3 py-2 border rounded text-black"
            >
              {DOC_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Área (opcional)"
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              className="px-3 py-2 border rounded text-black"
            />
            <input
              type="text"
              placeholder="Tribunal (opcional)"
              value={form.tribunal}
              onChange={(e) => setForm({ ...form, tribunal: e.target.value })}
              className="px-3 py-2 border rounded text-black"
            />
            <input
              type="text"
              placeholder="Tags (separadas por vírgula)"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              className="px-3 py-2 border rounded text-black"
            />
            <input
              type="text"
              placeholder="Versão"
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              className="px-3 py-2 border rounded text-black"
            />
          </div>
          <div className="mb-4">
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="w-full px-3 py-2 border rounded text-black font-mono text-sm"
              rows="12"
              placeholder="Conteúdo do documento (será anonimizado e dividido em chunks automaticamente)"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              onClick={closeForm}
              className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-gray-500">Carregando documentos...</p>
      ) : filteredDocs.length === 0 ? (
        <p className="text-center text-gray-500">Nenhum documento encontrado</p>
      ) : (
        <div className="space-y-4">
          {filteredDocs.map(doc => (
            <div key={doc.id} className="p-4 border rounded-lg bg-nc-black text-nc-white">
              <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2 mb-2">
                <div>
                  <h4 className="font-bold text-lg">{doc.title}</h4>
                  <div className="flex flex-wrap gap-2 mt-1 text-sm text-gray-300">
                    <span>{doc.type}</span>
                    {doc.area && <span>· {doc.area}</span>}
                    {doc.tribunal && <span>· {doc.tribunal}</span>}
                    {doc.version && <span>· {doc.version}</span>}
                    {doc.chunk_count !== undefined && <span>· {doc.chunk_count} chunks</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {doc.status !== 'aprovado' && (
                    <button
                      onClick={() => handleStatusChange(doc.id, 'aprovado')}
                      className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                    >
                      Aprovar
                    </button>
                  )}
                  {doc.status !== 'rascunho' && (
                    <button
                      onClick={() => handleStatusChange(doc.id, 'rascunho')}
                      className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
                    >
                      Voltar a rascunho
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(doc)}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    Editar
                  </button>
                </div>
              </div>

              <div className="flex gap-2 mb-2">
                {statusBadge(doc.status)}
                {Array.isArray(doc.tags) && doc.tags.map(tag => (
                  <span key={tag} className="text-xs px-2 py-1 bg-gray-700 text-gray-200 rounded">
                    {tag}
                  </span>
                ))}
              </div>

              <p className="text-sm text-gray-400 mb-2">
                Última atualização: {new Date(doc.updated_at).toLocaleString('pt-BR')}
              </p>

              <div className="bg-nc-surface p-3 rounded border border-nc-gray-800 text-sm text-gray-300 max-h-32 overflow-y-auto whitespace-pre-line">
                {doc.preview || 'Sem prévia'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
