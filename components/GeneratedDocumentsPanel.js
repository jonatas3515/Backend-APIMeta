import { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeaders } from '../lib/api';

export default function GeneratedDocumentsPanel({ caseId, conversationId, onClose, userRole }) {
  const [documents, setDocuments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [generating, setGenerating] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [message, setMessage] = useState(null);
  const canGenerate = userRole === 'admin' || userRole === 'advogado';

  useEffect(() => {
    if (caseId) {
      fetchDocuments();
      fetchTemplates();
    }
  }, [caseId]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({ case_id: caseId });
      if (conversationId) params.append('conversation_id', conversationId);
      
      const { data } = await axios.get(`/api/generated-documents?${params}`, { headers });
      setDocuments(data || []);
    } catch (error) {
      console.error('[GEN_DOCS] Erro ao buscar');
      setMessage({ type: 'error', text: 'Erro ao buscar documentos.' });
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.get('/api/templates', { headers });
      setTemplates(data || []);
    } catch (error) {
      console.error('[GEN_DOCS] Erro ao buscar templates');
    }
  };

  const handleGenerate = async () => {
    if (!selectedTemplate || !conversationId) return;
    if (!canGenerate) {
      setMessage({ type: 'error', text: 'Você não tem permissão para gerar documentos.' });
      return;
    }

    setGenerating(true);
    setMessage(null);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({
        action: 'generate',
        template_id: selectedTemplate,
        conversation_id: conversationId,
        case_id: caseId
      });
      
      await axios.get(`/api/templates?${params}`, { headers });
      setShowTemplateSelector(false);
      setSelectedTemplate('');
      fetchDocuments();
      setMessage({ type: 'success', text: 'Documento gerado com sucesso.' });
    } catch (error) {
      console.error('[GEN_DOCS] Erro ao gerar');
      setMessage({ type: 'error', text: error.response?.data?.error || 'Erro ao gerar documento. Tente novamente.' });
    } finally {
      setGenerating(false);
    }
  };

  const handleUpdateStatus = async (docId, newStatus) => {
    setUpdating(docId);
    setMessage(null);
    try {
      const headers = await getAuthHeaders();
      await axios.patch(`/api/generated-documents?id=${docId}`, { status: newStatus }, { headers });
      fetchDocuments();
      setMessage({ type: 'success', text: 'Status atualizado com sucesso.' });
    } catch (error) {
      console.error('[GEN_DOCS] Erro ao atualizar');
      setMessage({ type: 'error', text: 'Erro ao atualizar status. Tente novamente.' });
    } finally {
      setUpdating(null);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-800',
      review: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      sent: 'bg-blue-100 text-blue-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status) => {
    const labels = {
      draft: 'Rascunho',
      review: 'Em Revisão',
      approved: 'Aprovado',
      sent: 'Enviado'
    };
    return labels[status] || status;
  };

  return (
    <div className="space-y-4">
      {message && (
        <div className={`p-3 rounded text-sm ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message.text}
        </div>
      )}

      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-lg">📄 Documentos Gerados</h3>
        <button
          onClick={() => setShowTemplateSelector(true)}
          disabled={!canGenerate}
          title={canGenerate ? '' : 'Geração de documentos é restrita a administradores/advogados.'}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          + Gerar Documento
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : documents.length === 0 ? (
        <div className="p-4 bg-gray-50 border rounded text-center space-y-2">
          <p className="text-sm text-gray-600">Nenhum documento gerado para este caso.</p>
          {canGenerate && (
            <button
              onClick={() => setShowTemplateSelector(true)}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Gerar documento
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="p-3 border rounded bg-white">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <p className="font-medium text-sm">{doc.title}</p>
                  {doc.is_legacy && (
                    <p className="text-xs text-orange-600">⚠️ Documento legado (sem vínculo direto)</p>
                  )}
                  <p className="text-xs text-gray-500">
                    Gerado em {new Date(doc.generated_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded text-xs ${getStatusColor(doc.status)}`}>
                  {getStatusLabel(doc.status)}
                </span>
              </div>
              
              <div className="flex gap-2 mt-2">
                {doc.status === 'draft' && (
                  <button
                    onClick={() => handleUpdateStatus(doc.id, 'review')}
                    disabled={updating === doc.id || !canGenerate}
                    className="px-2 py-1 bg-yellow-600 text-white rounded text-xs hover:bg-yellow-700 disabled:opacity-50"
                  >
                    {updating === doc.id ? 'Atualizando...' : 'Enviar para Revisão'}
                  </button>
                )}
                {doc.status === 'review' && (
                  <>
                    <button
                      onClick={() => handleUpdateStatus(doc.id, 'approved')}
                      disabled={updating === doc.id || !canGenerate}
                      className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                    >
                      {updating === doc.id ? 'Atualizando...' : 'Aprovar'}
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(doc.id, 'draft')}
                      disabled={updating === doc.id || !canGenerate}
                      className="px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 disabled:opacity-50"
                    >
                      {updating === doc.id ? 'Atualizando...' : 'Voltar para Rascunho'}
                    </button>
                  </>
                )}
                {doc.status === 'approved' && (
                  <button
                    onClick={() => handleUpdateStatus(doc.id, 'sent')}
                    disabled={updating === doc.id || !canGenerate}
                    className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                  >
                    {updating === doc.id ? 'Atualizando...' : 'Marcar como Enviado'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showTemplateSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg">Selecionar Template</h3>
              <button
                onClick={() => setShowTemplateSelector(false)}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
              </button>
            </div>
            
            <div className="p-4">
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full px-3 py-2 border rounded mb-4"
              >
                <option value="">Selecione um template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.legal_area && `(${t.legal_area})`}
                  </option>
                ))}
              </select>
              
              <div className="flex gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={!selectedTemplate || generating}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {generating ? 'Gerando...' : 'Gerar'}
                </button>
                <button
                  onClick={() => setShowTemplateSelector(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
