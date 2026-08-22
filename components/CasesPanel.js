import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/useAuth';
import useAreaFilter from '../hooks/useAreaFilter';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { LEGAL_AREAS } from '../lib/legalAreas';
import ExportButtons from './ExportButtons';
import { exportCasesExcel } from '../lib/export';
import CaseCalendarSync from './CaseCalendarSync';
import FeeSimulator from './FeeSimulator';
import CaseProcessMonitoring from './CaseProcessMonitoring';
import DocumentChecklist from './DocumentChecklist';
import CaseDocumentsPanel from './CaseDocumentsPanel';
import DocumentRequestModal from './DocumentRequestModal';
import CaseDetailPanel from './CaseDetailPanel';
import CaseInsightsPanel from './CaseInsightsPanel';
import ConversationSelectorModal from './ConversationSelectorModal';

export default function CasesPanel({ notice }) {
  const router = useRouter();
  const { profile } = useAuth();
  const { selectedArea, setSelectedArea } = useAreaFilter();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    legal_area: '',
    document_status: ''
  });

  // Sincroniza filtro local com a área global
  useEffect(() => {
    setFilters((prev) => ({ ...prev, legal_area: selectedArea }));
  }, [selectedArea]);
  const [checklistMap, setChecklistMap] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editingCase, setEditingCase] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [caseView, setCaseView] = useState('list');
  const [dismissed, setDismissed] = useState(false);
  const [feeCase, setFeeCase] = useState(null);
  const [processCase, setProcessCase] = useState(null);
  const [checklistCase, setChecklistCase] = useState(null);
  const [docsCase, setDocsCase] = useState(null);
  const [requestCase, setRequestCase] = useState(null);
  const [showConversationSelector, setShowConversationSelector] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [formData, setFormData] = useState({
    conversation_id: '',
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

  // Sincroniza com query string (caseId, caseView) e carrega aba de detalhe
  useEffect(() => {
    if (router.isReady && router.query.caseId && cases.length > 0) {
      const found = cases.find((c) => c.id === router.query.caseId);
      if (found) {
        setSelectedCase(found);
        const view = router.query.caseView || 'visao-geral';
        setCaseView(view);
      }
    }
  }, [router.isReady, router.query, cases]);

  const openCase = (caseItem, view = 'visao-geral') => {
    setSelectedCase(caseItem);
    setCaseView(view);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('caseId', caseItem.id);
      url.searchParams.set('caseView', view);
      window.history.replaceState(null, '', url.toString());
    }
  };

  const updateCaseView = (view) => {
    setCaseView(view);
    if (selectedCase && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('caseId', selectedCase.id);
      url.searchParams.set('caseView', view);
      window.history.replaceState(null, '', url.toString());
    }
  };

  useEffect(() => {
    fetchCases();
    fetchChecklists();
    fetchConversations();
  }, [filters]);

  // Atalho N: abre formulário de novo caso via query string
  useEffect(() => {
    if (router.isReady && router.query.new === '1' && !showForm) {
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
      setShowForm(true);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/?tab=cases');
      }
    }
  }, [router.isReady, router.query, showForm]);

  // Atalhos contextuais E e Delete
  useKeyboardShortcuts([
    {
      keys: ['e'],
      handler: () => {
        if (selectedCase) {
          handleEditCase(selectedCase);
        }
      }
    },
    {
      keys: ['delete'],
      handler: () => {
        if (selectedCase) {
          handleDeleteCase(selectedCase.id);
        }
      }
    }
  ]);

  const fetchCases = async () => {
    setLoading(true);
    try {
      let query = supabase.from('cases').select('*');

      if (filters.status) query = query.eq('status', filters.status);
      if (filters.priority) query = query.eq('priority', filters.priority);
      if (filters.legal_area) query = query.eq('legal_area', filters.legal_area);

      const { data, error } = await query.order('deadline_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      const allCases = data || [];

      // Filtrar por documentos pendentes
      if (filters.document_status && checklistMap) {
        const filtered = allCases.filter(c => {
          const checklist = checklistMap[c.id] || [];
          const hasAny = checklist.length > 0;
          const hasPending = checklist.some(i => i.status !== 'received' && i.status !== 'verified');
          if (filters.document_status === 'pending') return hasAny && hasPending;
          if (filters.document_status === 'complete') return hasAny && !hasPending;
          return true;
        });
        setCases(filtered);
      } else {
        setCases(allCases);
      }
    } catch (error) {
      console.error('[CASES] Erro ao buscar casos:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChecklists = async () => {
    try {
      const { data: allChecklists, error } = await supabase
        .from('case_document_checklists')
        .select('case_id, status');

      if (error) throw error;

      const map = {};
      (allChecklists || []).forEach(item => {
        if (!map[item.case_id]) map[item.case_id] = [];
        map[item.case_id].push(item);
      });

      setChecklistMap(map);
    } catch (error) {
      console.error('[CASES] Erro ao buscar checklists:', error);
    }
  };

  const fetchConversations = async () => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, client_name, client_phone, client_status, legal_area, updated_at')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('[CASES] Erro ao buscar conversas:', error);
    }
  };

  const handleSaveCase = async () => {
    if (!formData.title) {
      alert('Título é obrigatório');
      return;
    }

    try {
      const payload = { ...formData };
      if (!payload.conversation_id) {
        delete payload.conversation_id;
      }

      if (editingCase) {
        const { error } = await supabase
          .from('cases')
          .update(payload)
          .eq('id', editingCase.id);

        if (error) throw error;
        console.log('[CASES] Caso atualizado');
      } else {
        const { error } = await supabase
          .from('cases')
          .insert([payload]);

        if (error) throw error;
        console.log('[CASES] Caso criado');
      }

      setShowForm(false);
      setEditingCase(null);
      setFormData({
        conversation_id: '',
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
      alert(error.message || 'Erro ao salvar caso. Verifique os dados e tente novamente.');
    }
  };

  const handleEditCase = (caseItem) => {
    setEditingCase(caseItem);
    setFormData(caseItem);
    setShowForm(true);
  };

  const handleDeleteCase = async (id) => {
    if (profile?.role === 'estagiario') {
      alert('Você não tem permissão para excluir casos.');
      return;
    }
    if (!confirm('Tem certeza que deseja deletar este caso?')) return;

    try {
      const { error } = await supabase.from('cases').delete().eq('id', id);
      if (error) throw error;
      setSelectedCase(null);
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

  const handleLinkConversation = async (conversation) => {
    if (!selectedCase || !conversation) return;
    try {
      const { data, error } = await supabase
        .from('cases')
        .update({ conversation_id: conversation.id })
        .eq('id', selectedCase.id)
        .select()
        .single();

      if (error) throw error;

      setSelectedCase(data);
      setCases((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      setShowConversationSelector(false);
    } catch (error) {
      console.error('[CASES] Erro ao vincular conversa:', error);
      alert(error.message || 'Erro ao vincular conversa');
    }
  };

  const handleUnlinkConversation = async () => {
    if (!selectedCase) return;
    try {
      const { data, error } = await supabase
        .from('cases')
        .update({ conversation_id: null })
        .eq('id', selectedCase.id)
        .select()
        .single();

      if (error) throw error;

      setSelectedCase(data);
      setCases((prev) => prev.map((c) => (c.id === data.id ? data : c)));
    } catch (error) {
      console.error('[CASES] Erro ao desvincular conversa:', error);
      alert(error.message || 'Erro ao desvincular conversa');
    }
  };

  if (selectedCase && caseView !== 'list' && caseView !== 'insights') {
    return (
      <div className="p-4 md:p-6 h-full w-full flex flex-col">
        <CaseDetailPanel
          caseItem={selectedCase}
          caseView={caseView}
          onChangeView={updateCaseView}
          onBack={() => {
            setSelectedCase(null);
            setCaseView('list');
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              url.searchParams.delete('caseId');
              url.searchParams.delete('caseView');
              window.history.replaceState(null, '', url.toString());
            }
          }}
          onOpenChecklist={() => setChecklistCase(selectedCase)}
          onOpenDocuments={() => setDocsCase(selectedCase)}
          onOpenFee={() => setFeeCase(selectedCase)}
          userRole={profile?.role}
          conversations={conversations}
          onOpenConversationSelector={() => setShowConversationSelector(true)}
          onUnlinkConversation={handleUnlinkConversation}
        />
      </div>
    );
  }

  if (caseView === 'insights') {
    return (
      <div className="p-4 md:p-6 bg-white rounded-lg shadow w-full h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Insights gerais</h2>
          <button
            onClick={() => setCaseView('list')}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Voltar para Casos
          </button>
        </div>
        <CaseInsightsPanel />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-white rounded-lg shadow w-full h-full overflow-y-auto">
      {notice && !dismissed && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800 flex justify-between items-center">
          <span>{notice}</span>
          <button
            onClick={() => setDismissed(true)}
            className="text-yellow-600 hover:text-yellow-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setCaseView('list')}
          className={`px-3 py-1.5 rounded text-sm font-medium ${caseView === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Casos
        </button>
        <button
          onClick={() => setCaseView('insights')}
          className={`px-3 py-1.5 rounded text-sm font-medium ${caseView === 'insights' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Insights gerais
        </button>
      </div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold">Casos Jurídicos</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <ExportButtons
            onExcel={() => exportCasesExcel(cases)}
            disabled={loading || cases.length === 0}
          />
          <button
            onClick={() => {
            setShowForm(true);
            setEditingCase(null);
            setFormData({
              conversation_id: '',
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
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

        <select
          value={filters.document_status}
          onChange={(e) => setFilters({ ...filters, document_status: e.target.value })}
          className="px-3 py-2 border rounded"
        >
          <option value="">Todos os Documentos</option>
          <option value="pending">Documentos Pendentes</option>
          <option value="complete">Checklist Completo</option>
        </select>

        <select
          value={filters.legal_area}
          onChange={(e) => setSelectedArea(e.target.value)}
          className="px-3 py-2 border rounded"
        >
          <option value="">Todas as áreas</option>
          {LEGAL_AREAS.map((area) => (
            <option key={area.value} value={area.value}>{area.label}</option>
          ))}
        </select>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="mb-6 p-4 border rounded bg-gray-50">
          <h3 className="text-lg font-bold mb-4">{editingCase ? 'Editar Caso' : 'Novo Caso'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="ID da conversa (opcional)"
              value={formData.conversation_id}
              onChange={(e) => setFormData({ ...formData, conversation_id: e.target.value })}
              className="px-3 py-2 border rounded"
            />
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
                const checklist = checklistMap[caseItem.id] || [];
                const totalDocs = checklist.length;
                const pendingDocs = checklist.filter(i => i.status !== 'received' && i.status !== 'verified').length;
                return (
                <tr
                  key={caseItem.id}
                  onClick={() => openCase(caseItem)}
                  className={`border-b hover:bg-gray-50 text-xs md:text-sm cursor-pointer ${
                    selectedCase?.id === caseItem.id ? 'bg-blue-50 ring-2 ring-inset ring-blue-200' : ''
                  }`}
                >
                    <td className="border p-3">
                      {caseItem.title}
                      {totalDocs > 0 && (
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${pendingDocs > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {pendingDocs > 0 ? `${pendingDocs} de ${totalDocs} pendentes` : '✓ completo'}
                        </span>
                      )}
                    </td>
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
                          <div className="mt-1">
                            <CaseCalendarSync eventId={caseItem.id} table="cases" deadlineDate={caseItem.deadline_date} title={caseItem.title} />
                          </div>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="border p-3 flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditCase(caseItem); }}
                        className="px-2 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                      >
                        Editar
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setChecklistCase(caseItem); }}
                        className="px-2 py-1 bg-teal-500 text-white rounded text-sm hover:bg-teal-600"
                      >
                        Checklist
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDocsCase(caseItem); }}
                        className="px-2 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600"
                      >
                        Documentos
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (!caseItem.conversation_id) { alert('Caso sem conversa vinculada. Vincule uma conversa antes de solicitar documentos.'); return; } setRequestCase(caseItem); }}
                        className="px-2 py-1 bg-cyan-500 text-white rounded text-sm hover:bg-cyan-600"
                      >
                        Solicitar
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setFeeCase(caseItem); }}
                        className="px-2 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                      >
                        Honorarios
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setProcessCase(caseItem); }}
                        className="px-2 py-1 bg-indigo-500 text-white rounded text-sm hover:bg-indigo-600"
                      >
                        Processo
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteCase(caseItem.id); }}
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

      {feeCase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg">Simulador de Honorários</h3>
              <button onClick={() => setFeeCase(null)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <FeeSimulator caseId={feeCase.id} caseData={feeCase} userRole={profile?.role} />
          </div>
        </div>
      )}

      {processCase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg">Monitoramento Processual</h3>
              <button onClick={() => setProcessCase(null)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <CaseProcessMonitoring caseId={processCase.id} userRole={profile?.role} />
          </div>
        </div>
      )}

      {checklistCase && (
        <DocumentChecklist caseItem={checklistCase} onClose={() => setChecklistCase(null)} />
      )}

      {docsCase && (
        <CaseDocumentsPanel
          caseItem={docsCase}
          onClose={() => setDocsCase(null)}
        />
      )}

      {requestCase && (
        <DocumentRequestModal caseItem={requestCase} onClose={() => setRequestCase(null)} />
      )}

      {showConversationSelector && selectedCase && (
        <ConversationSelectorModal
          caseItem={selectedCase}
          onSelect={handleLinkConversation}
          onClose={() => setShowConversationSelector(false)}
        />
      )}
    </div>
  );
}
