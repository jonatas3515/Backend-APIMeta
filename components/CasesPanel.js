import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function CasesPanel() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    legal_area: ''
  });
  const [showForm, setShowForm] = useState(false);
  const [editingCase, setEditingCase] = useState(null);
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

  useEffect(() => {
    fetchCases();
  }, [filters]);

  const fetchCases = async () => {
    setLoading(true);
    try {
      let query = supabase.from('cases').select('*');

      if (filters.status) query = query.eq('status', filters.status);
      if (filters.priority) query = query.eq('priority', filters.priority);
      if (filters.legal_area) query = query.eq('legal_area', filters.legal_area);

      const { data, error } = await query.order('deadline_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      setCases(data || []);
    } catch (error) {
      console.error('[CASES] Erro ao buscar casos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCase = async () => {
    if (!formData.title) {
      alert('Título é obrigatório');
      return;
    }

    try {
      if (editingCase) {
        const { error } = await supabase
          .from('cases')
          .update(formData)
          .eq('id', editingCase.id);

        if (error) throw error;
        console.log('[CASES] Caso atualizado');
      } else {
        const { error } = await supabase
          .from('cases')
          .insert([formData]);

        if (error) throw error;
        console.log('[CASES] Caso criado');
      }

      setShowForm(false);
      setEditingCase(null);
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
      console.error('[CASES] Erro ao salvar caso:', error);
      alert('Erro ao salvar caso');
    }
  };

  const handleEditCase = (caseItem) => {
    setEditingCase(caseItem);
    setFormData(caseItem);
    setShowForm(true);
  };

  const handleDeleteCase = async (id) => {
    if (!confirm('Tem certeza que deseja deletar este caso?')) return;

    try {
      const { error } = await supabase.from('cases').delete().eq('id', id);
      if (error) throw error;
      fetchCases();
    } catch (error) {
      console.error('[CASES] Erro ao deletar caso:', error);
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

  const getPriorityColor = (priority) => {
    const colors = {
      baixa: 'text-green-600',
      media: 'text-yellow-600',
      alta: 'text-red-600'
    };
    return colors[priority] || 'text-gray-600';
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
    <div className="p-4 md:p-6 bg-white rounded-lg shadow w-full h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Casos Jurídicos</h2>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingCase(null);
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
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + Novo Caso
        </button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="px-3 py-2 border rounded"
        >
          <option value="">Todos os Status</option>
          <option value="prospect">Prospect</option>
          <option value="em_analise">Em Análise</option>
          <option value="proposta_enviada">Proposta Enviada</option>
          <option value="contrato_assinado">Contrato Assinado</option>
          <option value="acao_protocolada">Ação Protocolada</option>
          <option value="aguardando_decisao">Aguardando Decisão</option>
          <option value="encerrado">Encerrado</option>
        </select>

        <select
          value={filters.priority}
          onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
          className="px-3 py-2 border rounded"
        >
          <option value="">Todas as Prioridades</option>
          <option value="baixa">Baixa</option>
          <option value="media">Média</option>
          <option value="alta">Alta</option>
        </select>

        <input
          type="text"
          placeholder="Buscar por área..."
          value={filters.legal_area}
          onChange={(e) => setFilters({ ...filters, legal_area: e.target.value })}
          className="px-3 py-2 border rounded"
        />
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="mb-6 p-4 border rounded bg-gray-50">
          <h3 className="text-lg font-bold mb-4">{editingCase ? 'Editar Caso' : 'Novo Caso'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Título do caso"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="px-3 py-2 border rounded"
            />
            <input
              type="text"
              placeholder="Área jurídica"
              value={formData.legal_area}
              onChange={(e) => setFormData({ ...formData, legal_area: e.target.value })}
              className="px-3 py-2 border rounded"
            />
            <input
              type="text"
              placeholder="Tipo de caso"
              value={formData.case_type}
              onChange={(e) => setFormData({ ...formData, case_type: e.target.value })}
              className="px-3 py-2 border rounded"
            />
            <input
              type="text"
              placeholder="Município"
              value={formData.municipality}
              onChange={(e) => setFormData({ ...formData, municipality: e.target.value })}
              className="px-3 py-2 border rounded"
            />
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="px-3 py-2 border rounded"
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
              className="px-3 py-2 border rounded"
            >
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
            </select>
            <input
              type="date"
              value={formData.deadline_date}
              onChange={(e) => setFormData({ ...formData, deadline_date: e.target.value })}
              className="px-3 py-2 border rounded"
            />
            <input
              type="text"
              placeholder="Tipo de prazo"
              value={formData.deadline_type}
              onChange={(e) => setFormData({ ...formData, deadline_type: e.target.value })}
              className="px-3 py-2 border rounded"
            />
            <textarea
              placeholder="Notas"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="px-3 py-2 border rounded col-span-2"
              rows="3"
            />
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSaveCase}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Salvar
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingCase(null);
              }}
              className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-gray-500">Carregando casos...</p>
      ) : cases.length === 0 ? (
        <p className="text-center text-gray-500">Nenhum caso encontrado</p>
      ) : (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 text-xs md:text-sm">
                <th className="border p-3 text-left">Título</th>
                <th className="border p-3 text-left">Área</th>
                <th className="border p-3 text-left">Status</th>
                <th className="border p-3 text-left">Prioridade</th>
                <th className="border p-3 text-left">Prazo</th>
                <th className="border p-3 text-left">Ações</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((caseItem) => {
                const daysLeft = daysUntilDeadline(caseItem.deadline_date);
                return (
                  <tr key={caseItem.id} className="border-b hover:bg-gray-50 text-xs md:text-sm">
                    <td className="border p-3">{caseItem.title}</td>
                    <td className="border p-3">{caseItem.legal_area || '-'}</td>
                    <td className="border p-3">
                      <span className={`px-2 py-1 rounded text-sm ${getStatusColor(caseItem.status)}`}>
                        {caseItem.status}
                      </span>
                    </td>
                    <td className="border p-3">
                      <span className={`font-bold ${getPriorityColor(caseItem.priority)}`}>
                        {caseItem.priority}
                      </span>
                    </td>
                    <td className="border p-3">
                      {caseItem.deadline_date ? (
                        <div>
                          <div>{formatDate(caseItem.deadline_date)}</div>
                          {daysLeft !== null && (
                            <div className={`text-sm ${daysLeft < 0 ? 'text-red-600 font-bold' : daysLeft < 7 ? 'text-orange-600' : 'text-gray-600'}`}>
                              {daysLeft < 0 ? `${Math.abs(daysLeft)} dias atrasado` : `${daysLeft} dias`}
                            </div>
                          )}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="border p-3 flex gap-2">
                      <button
                        onClick={() => handleEditCase(caseItem)}
                        className="px-2 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDeleteCase(caseItem.id)}
                        className="px-2 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                      >
                        Deletar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
