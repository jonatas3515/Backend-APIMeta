import { useState, useEffect } from 'react';

/**
 * Modal para criar caso a partir de conversa
 * Pré-preenche dados seguros da triagem, sem PII
 * 
 * Props:
 * - isOpen: boolean
 * - onClose: callback para fechar
 * - conversation: objeto da conversa
 * - onSuccess: callback após criação bem-sucedida (recebe caseId)
 */
export default function CaseCreationModal({ isOpen, onClose, conversation, onSuccess }) {
  const [formData, setFormData] = useState({
    title: '',
    legal_area: '',
    case_type: '',
    municipality: '',
    agency: '',
    client_role: '',
    status: 'prospect',
    priority: 'media',
    deadline_date: '',
    deadline_type: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Pré-preencher dados seguros da conversa
  useEffect(() => {
    if (isOpen && conversation) {
      const intake = conversation.intake_data || {};
      
      setFormData({
        title: '', // Usuário deve preencher
        legal_area: intake.legal_area || '',
        case_type: intake.case_type || '',
        municipality: intake.municipality || '',
        agency: intake.agency || '',
        client_role: intake.client_role || '',
        status: 'prospect',
        priority: 'media',
        deadline_date: '',
        deadline_type: '',
        notes: intake.case_summary || ''
      });
    }
  }, [isOpen, conversation]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      setError('Título é obrigatório');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversation.id,
          ...formData
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao criar caso');
      }

      const newCase = await response.json();
      onSuccess(newCase.id);
      onClose();
    } catch (err) {
      console.error('[CASE_CREATION] Erro:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Criar Caso Jurídico</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Aviso sobre dados sugeridos */}
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
            <p className="font-medium">💡 Dados sugeridos a partir da conversa</p>
            <p className="text-xs mt-1">Revise e edite os campos antes de salvar.</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* Título (obrigatório) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Título do Caso <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ex: Licença Prêmio - João Silva"
              required
            />
          </div>

          {/* Área Jurídica */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Área Jurídica
            </label>
            <select
              name="legal_area"
              value={formData.legal_area}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione...</option>
              <option value="Direito Administrativo">Direito Administrativo</option>
              <option value="Direito Previdenciário">Direito Previdenciário</option>
              <option value="Direito Civil">Direito Civil</option>
              <option value="Direito do Trabalho">Direito do Trabalho</option>
              <option value="Direito do Consumidor">Direito do Consumidor</option>
            </select>
          </div>

          {/* Tipo de Caso */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de Caso
            </label>
            <input
              type="text"
              name="case_type"
              value={formData.case_type}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: Licença Prêmio, Aposentadoria"
            />
          </div>

          {/* Município e Órgão */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Município
              </label>
              <input
                type="text"
                name="municipality"
                value={formData.municipality}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: São Paulo"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Órgão/Agência
              </label>
              <input
                type="text"
                name="agency"
                value={formData.agency}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: INSS, Prefeitura"
              />
            </div>
          </div>

          {/* Papel do Cliente */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Papel do Cliente
            </label>
            <select
              name="client_role"
              value={formData.client_role}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione...</option>
              <option value="autor">Autor</option>
              <option value="reu">Réu</option>
              <option value="interessado">Interessado</option>
            </select>
          </div>

          {/* Status e Prioridade */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="prospect">Prospect</option>
                <option value="em_analise">Em Análise</option>
                <option value="proposta_enviada">Proposta Enviada</option>
                <option value="contrato_assinado">Contrato Assinado</option>
                <option value="acao_protocolada">Ação Protocolada</option>
                <option value="aguardando_decisao">Aguardando Decisão</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prioridade
              </label>
              <select
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>

          {/* Prazo */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data do Prazo
              </label>
              <input
                type="date"
                name="deadline_date"
                value={formData.deadline_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Prazo
              </label>
              <select
                name="deadline_type"
                value={formData.deadline_type}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione...</option>
                <option value="prazo_para_ajuizar_acao">Prazo para Ajuizar Ação</option>
                <option value="prazo_para_recurso">Prazo para Recurso</option>
                <option value="data_de_audiencia">Data de Audiência</option>
                <option value="prazo_para_resposta_administrativa">Prazo para Resposta Administrativa</option>
                <option value="outro">Outro</option>
              </select>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas/Resumo
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              placeholder="Informações adicionais sobre o caso..."
            />
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Criando...' : 'Criar Caso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
