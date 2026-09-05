import { useState, useEffect } from 'react';
import axios from 'axios';
import { apiCall } from '../lib/apiClient';\nimport { supabase } from '../lib/supabaseClient';\n// import { getAuthHeaders } from '../lib/api';';

export default function SignaturePanel({ caseId, conversationId, onClose }) {
  const [signatures, setSignatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [signers, setSigners] = useState([
    { name: '', email: '', phone: '', send_via: 'whatsapp' }
  ]);
  const [formData, setFormData] = useState({
    document_type: 'proposta',
    document_url: ''
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [resolvedCaseId, setResolvedCaseId] = useState(caseId || null);
  const [caseSearchError, setCaseSearchError] = useState(null);

  useEffect(() => {
    const resolveCase = async () => {
      if (caseId && caseId !== 'undefined') {
        setResolvedCaseId(caseId);
        setLoading(false);
        return;
      }

      if (!conversationId) {
        setResolvedCaseId(null);
        setCaseSearchError('Nenhuma conversa vinculada.');
        setLoading(false);
        return;
      }

      try {
        const headers = await getAuthHeaders();
        const { data } = await axios.get(`/api/cases?conversation_id=${encodeURIComponent(conversationId)}`, { headers });

        const active = Array.isArray(data)
          ? data.find(c => c.status !== 'encerrado' && c.status !== 'cancelado')
          : (data && data.status !== 'encerrado' && data.status !== 'cancelado' ? data : null);

        if (!active) {
          setResolvedCaseId(null);
          setCaseSearchError('Vincule ou crie um caso para esta conversa antes de enviar documentos para assinatura.');
        } else {
          setResolvedCaseId(active.id);
          setCaseSearchError(null);
        }
      } catch (err) {
        setResolvedCaseId(null);
        setCaseSearchError('Erro ao buscar caso vinculado.');
        console.error('[SIGNATURE-PANEL] Erro ao buscar caso:', err);
      } finally {
        setLoading(false);
      }
    };

    resolveCase();
  }, [caseId, conversationId]);

  useEffect(() => {
    if (!resolvedCaseId) {
      setSignatures([]);
      return;
    }
    fetchSignatures();
  }, [resolvedCaseId]);

  const fetchSignatures = async () => {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const { data } = await axios.get(`/api/signatures/status?case_id=${encodeURIComponent(resolvedCaseId)}`, { headers });
      setSignatures(Array.isArray(data.signatures) ? data.signatures : [data.signatures]);
      setError(null);
    } catch (err) {
      console.error('Erro ao buscar assinaturas:', err);
      setError('Erro ao carregar assinaturas');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSigner = () => {
    setSigners([...signers, { name: '', email: '', phone: '', send_via: 'whatsapp' }]);
  };

  const handleRemoveSigner = (index) => {
    setSigners(signers.filter((_, i) => i !== index));
  };

  const handleSignerChange = (index, field, value) => {
    const updated = [...signers];
    updated[index][field] = value;
    setSigners(updated);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    try {
      // Validação básica
      if (!formData.document_url) {
        setError('URL do documento é obrigatória');
        return;
      }

      if (signers.some(s => !s.name || !s.email)) {
        setError('Todos os signatários devem ter nome e e-mail');
        return;
      }

      setSending(true);
      const headers = await getAuthHeaders();
      const { data } = await axios.post('/api/signatures/send', {
        case_id: resolvedCaseId,
        document_type: formData.document_type,
        document_url: formData.document_url,
        signers: signers
      }, { headers });

      setSuccess('Documento enviado para assinatura com sucesso!');
      setShowModal(false);
      setFormData({ document_type: 'proposta', document_url: '' });
      setSigners([{ name: '', email: '', phone: '', send_via: 'whatsapp' }]);
      fetchSignatures();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Erro ao enviar:', err);
      setError(err.response?.data?.error || 'Erro ao enviar documento');
    } finally {
      setSending(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'pending': 'bg-yellow-100 text-yellow-800',
      'signed': 'bg-blue-100 text-blue-800',
      'completed': 'bg-green-100 text-green-800',
      'rejected': 'bg-red-100 text-red-800',
      'expired': 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status) => {
    const labels = {
      'pending': '⏳ Aguardando Assinatura',
      'signed': '✅ Parcialmente Assinado',
      'completed': '✅ Concluído',
      'rejected': '❌ Rejeitado',
      'expired': '⏰ Expirado'
    };
    return labels[status] || status;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-nc-text">📝 Assinaturas Eletrônicas</h2>
        <button
          onClick={() => setShowModal(true)}
          disabled={!resolvedCaseId}
          className="px-4 py-2 bg-nc-yellow text-nc-text font-medium rounded hover:bg-nc-yellow-700 transition disabled:opacity-50"
        >
          + Enviar para Assinatura
        </button>
      </div>

      {caseSearchError && (
        <div className="p-4 bg-yellow-100 border border-yellow-300 rounded text-yellow-900">
          {caseSearchError}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-100 border border-red-300 rounded text-red-800">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-100 border border-green-300 rounded text-green-800">
          {success}
        </div>
      )}

      {/* Modal de Envio */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-nc-text">Enviar Documento para Assinatura</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSend} className="p-6 space-y-6">
              {/* Tipo de Documento */}
              <div>
                <label className="block text-sm font-medium text-nc-text mb-2">
                  Tipo de Documento
                </label>
                <select
                  value={formData.document_type}
                  onChange={(e) => setFormData({ ...formData, document_type: e.target.value })}
                  className="w-full px-3 py-2 border border-nc-gray-300 rounded focus:outline-none focus:border-nc-yellow"
                >
                  <option value="proposta">Proposta</option>
                  <option value="contrato">Contrato</option>
                  <option value="termo_consentimento">Termo de Consentimento</option>
                </select>
              </div>

              {/* URL do Documento */}
              <div>
                <label className="block text-sm font-medium text-nc-text mb-2">
                  URL do Documento (PDF)
                </label>
                <input
                  type="url"
                  value={formData.document_url}
                  onChange={(e) => setFormData({ ...formData, document_url: e.target.value })}
                  placeholder="https://exemplo.com/documento.pdf"
                  required
                  className="w-full px-3 py-2 border border-nc-gray-300 rounded focus:outline-none focus:border-nc-yellow"
                />
              </div>

              {/* Signatários */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-medium text-nc-text">
                    Signatários
                  </label>
                  <button
                    type="button"
                    onClick={handleAddSigner}
                    className="text-sm text-nc-yellow hover:text-nc-yellow-700 font-medium"
                  >
                    + Adicionar Signatário
                  </button>
                </div>

                <div className="space-y-4">
                  {signers.map((signer, index) => (
                    <div key={index} className="p-4 bg-nc-surface border border-nc-gray-300 rounded space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-nc-text">Signatário {index + 1}</h4>
                        {signers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSigner(index)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Remover
                          </button>
                        )}
                      </div>

                      <input
                        type="text"
                        value={signer.name}
                        onChange={(e) => handleSignerChange(index, 'name', e.target.value)}
                        placeholder="Nome completo"
                        required
                        className="w-full px-3 py-2 border border-nc-gray-300 rounded focus:outline-none focus:border-nc-yellow text-sm"
                      />

                      <input
                        type="email"
                        value={signer.email}
                        onChange={(e) => handleSignerChange(index, 'email', e.target.value)}
                        placeholder="E-mail"
                        required
                        className="w-full px-3 py-2 border border-nc-gray-300 rounded focus:outline-none focus:border-nc-yellow text-sm"
                      />

                      <input
                        type="tel"
                        value={signer.phone}
                        onChange={(e) => handleSignerChange(index, 'phone', e.target.value)}
                        placeholder="Telefone (WhatsApp)"
                        className="w-full px-3 py-2 border border-nc-gray-300 rounded focus:outline-none focus:border-nc-yellow text-sm"
                      />

                      <select
                        value={signer.send_via}
                        onChange={(e) => handleSignerChange(index, 'send_via', e.target.value)}
                        className="w-full px-3 py-2 border border-nc-gray-300 rounded focus:outline-none focus:border-nc-yellow text-sm"
                      >
                        <option value="whatsapp">WhatsApp</option>
                        <option value="email">E-mail</option>
                        <option value="both">Ambos</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={sending || !resolvedCaseId}
                  className="flex-1 px-4 py-2 bg-nc-yellow text-nc-text font-medium rounded hover:bg-nc-yellow-700 transition disabled:opacity-50"
                >
                  {sending ? 'Enviando...' : 'Enviar para Assinatura'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 font-medium rounded hover:bg-gray-400 transition"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista de Assinaturas */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center p-8 text-nc-text-muted">Carregando assinaturas...</div>
        ) : signatures.length === 0 ? (
          <div className="p-6 bg-nc-surface border border-nc-gray-300 rounded-lg text-center">
            <p className="text-nc-text-muted">Nenhum documento enviado para assinatura</p>
          </div>
        ) : (
          signatures.map((sig) => (
            <div key={sig.id} className="p-6 bg-nc-surface border border-nc-gray-300 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-nc-text capitalize">
                    {sig.document_type.replace(/_/g, ' ')}
                  </h3>
                  <p className="text-sm text-nc-text-muted">{sig.document_name}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(sig.status)}`}>
                  {getStatusLabel(sig.status)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-nc-text-muted">Enviado em</p>
                  <p className="text-nc-text font-medium">
                    {new Date(sig.sent_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                {sig.completed_at && (
                  <div>
                    <p className="text-nc-text-muted">Concluído em</p>
                    <p className="text-nc-text font-medium">
                      {new Date(sig.completed_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                )}
              </div>

              {sig.signers && (
                <div>
                  <p className="text-sm font-medium text-nc-text mb-2">Signatários</p>
                  <div className="space-y-2">
                    {sig.signers.map((signer, idx) => (
                      <div key={idx} className="text-sm p-2 bg-white rounded border border-nc-gray-200">
                        <div className="flex items-center justify-between">
                          <span className="text-nc-text">{signer.name}</span>
                          <span className={signer.signed ? 'text-green-600' : 'text-yellow-600'}>
                            {signer.signed ? '✅ Assinado' : '⏳ Pendente'}
                          </span>
                        </div>
                        <p className="text-nc-text-muted text-xs">{signer.email}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sig.document_url && (
                <a
                  href={sig.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-nc-yellow hover:text-nc-yellow-700 font-medium text-sm"
                >
                  📄 Visualizar Documento
                </a>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

