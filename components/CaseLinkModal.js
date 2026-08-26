import { useState, useEffect } from 'react';

/**
 * Modal para vincular conversa a caso existente
 * Permite buscar e selecionar caso com confirmação explícita
 * 
 * Props:
 * - isOpen: boolean
 * - onClose: callback para fechar
 * - conversationId: ID da conversa a vincular
 * - onSuccess: callback após vinculação bem-sucedida (recebe caseId)
 */
export default function CaseLinkModal({ isOpen, onClose, conversationId, onSuccess }) {
  const [cases, setCases] = useState([]);
  const [filteredCases, setFilteredCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState(null);

  // Buscar casos disponíveis
  useEffect(() => {
    if (isOpen) {
      fetchCases();
    }
  }, [isOpen]);

  // Filtrar casos
  useEffect(() => {
    let filtered = cases;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c =>
        c.title.toLowerCase().includes(term) ||
        (c.legal_area && c.legal_area.toLowerCase().includes(term)) ||
        (c.case_type && c.case_type.toLowerCase().includes(term))
      );
    }

    if (filterStatus) {
      filtered = filtered.filter(c => c.status === filterStatus);
    }

    if (filterArea) {
      filtered = filtered.filter(c => c.legal_area === filterArea);
    }

    setFilteredCases(filtered);
  }, [cases, searchTerm, filterStatus, filterArea]);

  const fetchCases = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/cases');
      if (!response.ok) throw new Error('Erro ao buscar casos');

      const data = await response.json();
      
      // Filtrar apenas casos sem conversa vinculada ou encerrados
      const availableCases = data.filter(c => 
        !c.conversation_id || c.status === 'encerrado'
      );
      
      setCases(availableCases);
      setFilteredCases(availableCases);
    } catch (err) {
      console.error('[CASE_LINK] Erro ao buscar casos:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async () => {
    if (!selectedCase) return;

    setLinking(true);
    setError(null);

    try {
      const response = await fetch(`/api/cases?id=${selectedCase.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao vincular caso');
      }

      onSuccess(selectedCase.id);
      onClose();
    } catch (err) {
      console.error('[CASE_LINK] Erro ao vincular:', err.message);
      setError(err.message);
    } finally {
      setLinking(false);
    }
  };

  const getStatusBadgeColor = (status) => {
    const colors = {
      'prospect': 'bg-gray-100 text-gray-700',
      'em_analise': 'bg-blue-100 text-blue-700',
      'proposta_enviada': 'bg-yellow-100 text-yellow-700',
      'contrato_assinado': 'bg-green-100 text-green-700',
      'acao_protocolada': 'bg-purple-100 text-purple-700',
      'aguardando_decisao': 'bg-orange-100 text-orange-700',
      'encerrado': 'bg-red-100 text-red-700'
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Vincular a Caso Existente</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={linking}
          >
            ✕
          </button>
        </div>

        {/* Filtros */}
        <div className="px-6 py-4 border-b bg-gray-50 space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Buscar por título, área ou tipo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos os status</option>
              <option value="prospect">Prospect</option>
              <option value="em_analise">Em Análise</option>
              <option value="proposta_enviada">Proposta Enviada</option>
              <option value="contrato_assinado">Contrato Assinado</option>
              <option value="acao_protocolada">Ação Protocolada</option>
              <option value="aguardando_decisao">Aguardando Decisão</option>
              <option value="encerrado">Encerrado</option>
            </select>
            <select
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas as áreas</option>
              <option value="Direito Administrativo">Direito Administrativo</option>
              <option value="Direito Previdenciário">Direito Previdenciário</option>
              <option value="Direito Civil">Direito Civil</option>
              <option value="Direito do Trabalho">Direito do Trabalho</option>
              <option value="Direito do Consumidor">Direito do Consumidor</option>
            </select>
          </div>
        </div>

        {/* Lista de casos */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800 mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-gray-500">
              Carregando casos...
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Nenhum caso disponível para vinculação.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCases.map(caseItem => (
                <div
                  key={caseItem.id}
                  onClick={() => setSelectedCase(caseItem)}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    selectedCase?.id === caseItem.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900">{caseItem.title}</h3>
                        <span className={`text-xs px-2 py-1 rounded ${getStatusBadgeColor(caseItem.status)}`}>
                          {caseItem.status}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 mt-1 space-y-1">
                        {caseItem.legal_area && (
                          <p>📚 {caseItem.legal_area} {caseItem.case_type && `• ${caseItem.case_type}`}</p>
                        )}
                        {(caseItem.municipality || caseItem.agency) && (
                          <p>
                            📍 {caseItem.municipality || ''} {caseItem.agency && `• ${caseItem.agency}`}
                          </p>
                        )}
                      </div>
                    </div>
                    {selectedCase?.id === caseItem.id && (
                      <div className="ml-4">
                        <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm">✓</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer com confirmação */}
        {selectedCase && (
          <div className="border-t px-6 py-4 bg-gray-50">
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
              <p className="text-sm text-yellow-800">
                <strong>⚠️ Confirmar vinculação:</strong> Esta conversa será vinculada ao caso "{selectedCase.title}". 
                Esta ação pode ser desfeita posteriormente.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-100 transition-colors"
                disabled={linking}
              >
                Cancelar
              </button>
              <button
                onClick={handleLink}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                disabled={linking}
              >
                {linking ? 'Vinculando...' : 'Confirmar Vinculação'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
