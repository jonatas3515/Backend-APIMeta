import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function CaseSidebar({ conversationId }) {
  const [cases, setCases] = useState([]);
  const [showForm, setShowForm] = useState(false);
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (conversationId) {
      fetchCases();
    }
  }, [conversationId]);

  const fetchCases = async () => {
    try {
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .eq('conversation_id', conversationId);

      if (error) throw error;
      setCases(data || []);
    } catch (error) {
      console.error('[CASE_SIDEBAR] Erro ao buscar casos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCase = async () => {
    if (!formData.title) {
      alert('Título é obrigatório');
      return;
    }

    try {
      const { error } = await supabase
        .from('cases')
        .insert([{
          conversation_id: conversationId,
          ...formData
        }]);

      if (error) throw error;
      setShowForm(false);
      setFormData({
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
      fetchCases();
    } catch (error) {
      console.error('[CASE_SIDEBAR] Erro ao criar caso:', error);
      alert('Erro ao criar caso');
    }
  };

  const handleUpdateCase = async (caseId, updates) => {
    try {
      const { error } = await supabase
        .from('cases')
        .update(updates)
        .eq('id', caseId);

      if (error) throw error;
      fetchCases();
    } catch (error) {
      console.error('[CASE_SIDEBAR] Erro ao atualizar caso:', error);
      alert('Erro ao atualizar caso');
    }
  };

  const handleDeleteCase = async (caseId) => {
    if (!confirm('Deletar este caso?')) return;

    try {
      const { error } = await supabase
        .from('cases')
        .delete()
        .eq('id', caseId);

      if (error) throw error;
      fetchCases();
    } catch (error) {
      console.error('[CASE_SIDEBAR] Erro ao deletar caso:', error);
      alert('Erro ao deletar caso');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      prospect: 'bg-gray-100 text-gray-800',
      em_analise: 'bg-blue-100 text-blue-800',
      proposta_enviada: 'bg-yellow-100 text-yellow-800',
      contrato_assinado: 'bg-purple-100 text-purple-800',
      acao_protocolada: 'bg-orange-100 text-orange-800',
      aguardando_decisao: 'bg-red-100 text-red-800',
      encerrado: 'bg-green-100 text-green-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const daysUntilDeadline = (date) => {
    if (!date) return null;
    const today = new Date();
    const deadline = new Date(date);
    const diff = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="w-80 bg-gray-50 border-l border-gray-200 overflow-y-auto">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-bold text-lg mb-3">Casos Jurídicos</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          {showForm ? 'Cancelar' : '+ Novo Caso'}
        </button>
      </div>

      {/* Formulário de Novo Caso */}
      {showForm && (
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="space-y-2 text-sm">
            <input
              type="text"
              placeholder="Título"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-2 py-1 border rounded text-xs"
            />
            <input
              type="text"
              placeholder="Área jurídica"
              value={formData.legal_area}
              onChange={(e) => setFormData({ ...formData, legal_area: e.target.value })}
              className="w-full px-2 py-1 border rounded text-xs"
            />
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-2 py-1 border rounded text-xs"
            >
              <option value="prospect">Prospect</option>
              <option value="em_analise">Em Análise</option>
              <option value="proposta_enviada">Proposta Enviada</option>
              <option value="contrato_assinado">Contrato Assinado</option>
              <option value="acao_protocolada">Ação Protocolada</option>
              <option value="aguardando_decisao">Aguardando Decisão</option>
              <option value="encerrado">Encerrado</option>
            </select>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              className="w-full px-2 py-1 border rounded text-xs"
            >
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
            </select>
            <input
              type="date"
              value={formData.deadline_date}
              onChange={(e) => setFormData({ ...formData, deadline_date: e.target.value })}
              className="w-full px-2 py-1 border rounded text-xs"
            />
            <textarea
              placeholder="Notas"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-2 py-1 border rounded text-xs"
              rows="2"
            />
            <button
              onClick={handleCreateCase}
              className="w-full px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
            >
              Criar Caso
            </button>
          </div>
        </div>
      )}

      {/* Lista de Casos */}
      <div className="p-4">
        {loading ? (
          <p className="text-xs text-gray-500">Carregando...</p>
        ) : cases.length === 0 ? (
          <p className="text-xs text-gray-500">Nenhum caso associado</p>
        ) : (
          <div className="space-y-3">
            {cases.map((caseItem) => {
              const daysLeft = daysUntilDeadline(caseItem.deadline_date);
              return (
                <div key={caseItem.id} className="p-3 bg-white border rounded">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-sm">{caseItem.title}</h4>
                    <button
                      onClick={() => handleDeleteCase(caseItem.id)}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-1 text-xs">
                    {caseItem.legal_area && (
                      <p className="text-gray-600">Área: {caseItem.legal_area}</p>
                    )}

                    <div className="flex gap-2">
                      <span className={`px-2 py-1 rounded text-xs ${getStatusColor(caseItem.status)}`}>
                        {caseItem.status}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-bold ${caseItem.priority === 'alta' ? 'bg-red-100 text-red-800' : caseItem.priority === 'media' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                        {caseItem.priority}
                      </span>
                    </div>

                    {caseItem.deadline_date && (
                      <div className={`p-2 rounded ${daysLeft < 0 ? 'bg-red-50 text-red-700' : daysLeft < 7 ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>
                        <p className="font-semibold">{formatDate(caseItem.deadline_date)}</p>
                        <p className="text-xs">
                          {daysLeft < 0 ? `${Math.abs(daysLeft)} dias atrasado` : `${daysLeft} dias`}
                        </p>
                        {caseItem.deadline_type && (
                          <p className="text-xs mt-1">{caseItem.deadline_type}</p>
                        )}
                      </div>
                    )}

                    {caseItem.notes && (
                      <p className="text-gray-600 italic">{caseItem.notes}</p>
                    )}

                    <select
                      value={caseItem.status}
                      onChange={(e) => handleUpdateCase(caseItem.id, { status: e.target.value })}
                      className="w-full px-2 py-1 border rounded text-xs mt-2"
                    >
                      <option value="prospect">Prospect</option>
                      <option value="em_analise">Em Análise</option>
                      <option value="proposta_enviada">Proposta Enviada</option>
                      <option value="contrato_assinado">Contrato Assinado</option>
                      <option value="acao_protocolada">Ação Protocolada</option>
                      <option value="aguardando_decisao">Aguardando Decisão</option>
                      <option value="encerrado">Encerrado</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
