import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/useAuth';
import { getAuthHeaders } from '../lib/api';

const STATUS_LABELS = {
  pending: 'Pendente',
  sent: 'Enviado',
  received: 'Recebido',
  verified: 'Verificado'
};

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-800 border-gray-200',
  sent: 'bg-blue-100 text-blue-800 border-blue-200',
  received: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  verified: 'bg-green-100 text-green-800 border-green-200'
};

export default function DocumentChecklist({ caseItem, onClose }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [items, setItems] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newItemName, setNewItemName] = useState('');

  useEffect(() => {
    fetchChecklist();
    if (isAdmin) {
      fetchTemplates();
    }
  }, [caseItem.id, isAdmin]);

  const fetchChecklist = async () => {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const { data } = await axios.get(
        `/api/document-checklists?case_id=${caseItem.id}&sync=true`,
        { headers }
      );
      setItems(data || []);
    } catch (error) {
      console.error('[DOCUMENT_CHECKLIST] Erro ao carregar checklist:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.get(
        `/api/document-checklist-templates?case_type=${encodeURIComponent(caseItem.case_type || '')}`,
        { headers }
      );
      setTemplates(data || []);
    } catch (error) {
      console.error('[DOCUMENT_CHECKLIST] Erro ao carregar templates:', error);
    }
  };

  const handleStatusChange = async (itemId, newStatus) => {
    try {
      setSaving(true);
      const headers = await getAuthHeaders();
      await axios.patch(
        `/api/document-checklists?id=${itemId}`,
        { status: newStatus },
        { headers }
      );
      await fetchChecklist();
    } catch (error) {
      console.error('[DOCUMENT_CHECKLIST] Erro ao atualizar status:', error);
      alert('Erro ao atualizar status');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTemplate = async () => {
    if (!newTemplateName.trim()) return;
    try {
      const headers = await getAuthHeaders();
      await axios.post(
        '/api/document-checklist-templates',
        {
          case_type: caseItem.case_type,
          document_name: newTemplateName.trim(),
          required: true
        },
        { headers }
      );
      setNewTemplateName('');
      await fetchTemplates();
      await fetchChecklist();
    } catch (error) {
      console.error('[DOCUMENT_CHECKLIST] Erro ao adicionar template:', error);
      alert('Erro ao adicionar template');
    }
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) return;
    try {
      const headers = await getAuthHeaders();
      await axios.post(
        '/api/document-checklists',
        {
          case_id: caseItem.id,
          document_name: newItemName.trim(),
          status: 'pending'
        },
        { headers }
      );
      setNewItemName('');
      await fetchChecklist();
    } catch (error) {
      console.error('[DOCUMENT_CHECKLIST] Erro ao adicionar item:', error);
      alert('Erro ao adicionar item');
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!confirm('Remover este item do checklist?')) return;
    try {
      const headers = await getAuthHeaders();
      await axios.delete(`/api/document-checklists?id=${itemId}`, { headers });
      await fetchChecklist();
    } catch (error) {
      console.error('[DOCUMENT_CHECKLIST] Erro ao remover item:', error);
      alert('Erro ao remover item');
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!confirm('Remover este template?')) return;
    try {
      const headers = await getAuthHeaders();
      await axios.delete(`/api/document-checklist-templates?id=${templateId}`, { headers });
      await fetchTemplates();
      await fetchChecklist();
    } catch (error) {
      console.error('[DOCUMENT_CHECKLIST] Erro ao remover template:', error);
      alert('Erro ao remover template');
    }
  };

  const total = items.length;
  const done = items.filter(i => i.status === 'received' || i.status === 'verified').length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold">Checklist de Documentos</h3>
            <p className="text-sm text-gray-500">{caseItem.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {caseItem.case_type ? (
            <p className="text-sm text-gray-600 mb-4">Tipo: <span className="font-medium">{caseItem.case_type}</span></p>
          ) : (
            <p className="text-sm text-red-600 mb-4">Caso sem tipo definido. O checklist não pode ser sincronizado automaticamente.</p>
          )}

          {/* Progresso */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium">{done} de {total} documentos recebidos</span>
              <span className="font-bold">{percent}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  percent === 100 ? 'bg-green-500' : percent >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          {loading ? (
            <p className="text-center text-gray-500">Carregando checklist...</p>
          ) : (
            <div className="space-y-3">
              {items.length === 0 ? (
                <p className="text-center text-gray-500">Nenhum documento configurado para este tipo de caso.</p>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="border rounded p-3 bg-gray-50">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{item.document_name}</p>
                        {item.received_at && (
                          <p className="text-xs text-gray-500">
                            {new Date(item.received_at).toLocaleString('pt-BR')} {item.received_by && '• ' + item.received_by}
                          </p>
                        )}
                        {item.media_url && (
                          <a
                            href={item.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline break-all"
                          >
                            Ver anexo
                          </a>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs border ${STATUS_COLORS[item.status]}`}>
                          {STATUS_LABELS[item.status]}
                        </span>

                        <select
                          value={item.status}
                          onChange={(e) => handleStatusChange(item.id, e.target.value)}
                          disabled={saving}
                          className="text-xs border rounded px-2 py-1"
                        >
                          <option value="pending">Pendente</option>
                          <option value="sent">Enviado</option>
                          <option value="received">Recebido</option>
                          <option value="verified">Verificado</option>
                        </select>

                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-red-500 hover:text-red-700 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* Adicionar item manual */}
              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  placeholder="Novo documento..."
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded text-sm"
                />
                <button
                  onClick={handleAddItem}
                  className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  + Adicionar
                </button>
              </div>
            </div>
          )}

          {/* Administração de templates */}
          {isAdmin && (
            <div className="mt-6 border-t pt-4">
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className="text-sm text-blue-600 hover:underline font-medium"
              >
                {adminOpen ? 'Ocultar' : 'Gerenciar templates'} ({templates.length})
              </button>

              {adminOpen && (
                <div className="mt-3 space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nome do documento padrão..."
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      className="flex-1 px-3 py-2 border rounded text-sm"
                    />
                    <button
                      onClick={handleAddTemplate}
                      className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                    >
                      + Template
                    </button>
                  </div>

                  {templates.length > 0 && (
                    <ul className="space-y-2">
                      {templates.map((t) => (
                        <li key={t.id} className="flex justify-between items-center text-sm border rounded p-2 bg-white">
                          <span>{t.document_name}</span>
                          <button
                            onClick={() => handleDeleteTemplate(t.id)}
                            className="text-red-500 hover:text-red-700 text-xs"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
