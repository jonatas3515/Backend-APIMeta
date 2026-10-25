import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/useAuth';
import { useToast } from '../lib/useToast';
import { getErrorMessage } from '../lib/errorMessage';
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
import CaseDecisionExtractorModal from './CaseDecisionExtractorModal';
import CaseFinalizeModal from './CaseFinalizeModal';
import { parseCaseFee, calculateFeeAmount, serializeFeeIntoNotes, stripFeeFromNotes } from '../lib/caseFeeHelper';

const PROCEDURAL_STEP_LABELS = {
  conciliacao: 'Conciliação',
  instrucao: 'Instrução',
  sentenca: 'Sentença',
  recurso: 'Recurso',
  execucao: 'Execução',
  acordo: 'Acordo',
  outro: 'Outro'
};

const STATUS_LABELS = {
  prospect: 'Prospect',
  em_analise: 'Em Análise',
  proposta_enviada: 'Proposta Enviada',
  contrato_assinado: 'Contrato Assinado',
  acao_protocolada: 'Ação Protocolada',
  aguardando_decisao: 'Aguardando Decisão',
  em_recurso: 'Fase de Recurso',
  em_execucao: 'Fase de Execução',
  encerrado: 'Encerrado',
  arquivado: 'Arquivado'
};

export default function CasesPanel({ notice }) {
  const router = useRouter();
  const { profile } = useAuth();
  const { addToast } = useToast();
  const canEdit = profile?.role === 'admin' || profile?.role === 'advogado';
  const { selectedArea, setSelectedArea } = useAreaFilter();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    legal_area: '',
    document_status: '',
    court: '',
    procedural_step: ''
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
  const [decisionExtractorCase, setDecisionExtractorCase] = useState(null);
  const [finalizeCase, setFinalizeCase] = useState(null);
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
    notes: '',
    process_number: '',
    court: '',
    court_division: '',
    judicial_district: '',
    procedural_step: '',
    case_value: '',
    distribution_date: '',
    fee_type: 'percentual',
    fee_percentage: '30',
    fee_basis: 'condenacao',
    awarded_value: '',
    fee_fixed_value: '',
    fee_final_value: '',
    fee_paid: false,
    fee_has_entry: false,
    fee_entry_value: '',
    fee_entry_paid: false,
    fee_entry_date: '',
    fee_is_installment: false,
    fee_installments_count: '1',
    fee_due_date: '',
    fee_notify_due: true
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
    router.replace({
      pathname: router.pathname,
      query: { ...router.query, tab: 'cases', caseId: caseItem.id, caseView: view }
    }, undefined, { shallow: true });
  };

  const updateCaseView = (view) => {
    setCaseView(view);
    if (selectedCase) {
      router.replace({
        pathname: router.pathname,
        query: { ...router.query, tab: 'cases', caseId: selectedCase.id, caseView: view }
      }, undefined, { shallow: true });
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
        notes: '',
        process_number: '',
        court: '',
        court_division: '',
        judicial_district: '',
        procedural_step: '',
        case_value: '',
        distribution_date: ''
      });
      setShowForm(true);
      const query = { ...router.query };
      delete query.new;
      query.tab = 'cases';
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
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
      if (filters.court) query = query.eq('court', filters.court);
      if (filters.procedural_step) query = query.eq('procedural_step', filters.procedural_step);

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
      setActionMessage({ type: 'error', text: 'Título do caso é obrigatório.' });
      return;
    }

    if (saving) return;
    setSaving(true);
    setActionMessage(null);

    try {
      const allowedFields = [
        'conversation_id',
        'title',
        'legal_area',
        'case_type',
        'municipality',
        'agency',
        'client_role',
        'status',
        'priority',
        'deadline_date',
        'deadline_type',
        'notes',
        'process_number',
        'court',
        'court_division',
        'judicial_district',
        'procedural_step',
        'distribution_date',
        'case_value'
      ];
      const payload = {};
      allowedFields.forEach((field) => {
        if (formData[field] !== undefined) {
          payload[field] = formData[field];
        }
      });
      if (!payload.conversation_id) {
        payload.conversation_id = null;
      }
      for (const field of [
        'conversation_id',
        'process_number',
        'court',
        'court_division',
        'judicial_district',
        'procedural_step',
        'distribution_date',
        'deadline_date',
        'deadline_type',
        'notes',
        'municipality',
        'agency',
        'client_role',
        'legal_area',
        'case_type'
      ]) {
        if (payload[field] === '' || payload[field] === undefined) payload[field] = null;
      }
      payload.case_value = payload.case_value === '' || payload.case_value === undefined || payload.case_value === null
        ? null
        : Number(payload.case_value);

      // Salva dados de honorários personalizados (em notes estruturado)
      const feeData = {
        fee_type: formData.fee_type || 'percentual',
        fee_percentage: Number(formData.fee_percentage) || 30,
        fee_basis: formData.fee_basis || 'condenacao',
        awarded_value: formData.awarded_value ? Number(formData.awarded_value) : null,
        fee_fixed_value: formData.fee_fixed_value ? Number(formData.fee_fixed_value) : null,
        fee_final_value: formData.fee_final_value ? Number(formData.fee_final_value) : null,
        fee_paid: Boolean(formData.fee_paid),
        fee_has_entry: Boolean(formData.fee_has_entry),
        fee_entry_value: formData.fee_entry_value ? Number(formData.fee_entry_value) : null,
        fee_entry_paid: Boolean(formData.fee_entry_paid),
        fee_entry_date: formData.fee_entry_date || null,
        fee_is_installment: Boolean(formData.fee_is_installment),
        fee_installments_count: formData.fee_installments_count ? Number(formData.fee_installments_count) : 1,
        fee_due_date: formData.fee_due_date || null,
        fee_notify_due: formData.fee_notify_due !== false
      };
      payload.notes = serializeFeeIntoNotes(payload.notes, feeData);

      let savedCaseId = editingCase ? editingCase.id : null;
      if (editingCase) {
        const { data, error } = await supabase
          .from('cases')
          .update(payload)
          .eq('id', editingCase.id)
          .select()
          .single();

        if (error) throw error;
        setSelectedCase((prev) => (prev && prev.id === editingCase.id ? data : prev));
      } else {
        const { data, error } = await supabase
          .from('cases')
          .insert([payload])
          .select()
          .single();

        if (error) throw error;
        if (data) savedCaseId = data.id;
      }

      // Agenda notificação de vencimento na tabela tasks se selecionado
      if (formData.fee_notify_due && formData.fee_due_date && !formData.fee_paid && savedCaseId) {
        try {
          await supabase.from('tasks').insert([{
            title: `Cobrança de Honorários — ${payload.title}`,
            description: `Vencimento de honorários agendado para ${formData.fee_due_date}. Valor: R$ ${formData.fee_fixed_value || 'a apurar'}.`,
            case_id: savedCaseId,
            due_date: formData.fee_due_date,
            priority: 'alta',
            status: 'pendente',
            done: false
          }]);
        } catch (e) {
          console.warn('[CASES] Erro ao registrar tarefa de honorários:', e);
        }
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
        notes: '',
        process_number: '',
        court: '',
        court_division: '',
        judicial_district: '',
        procedural_step: '',
        case_value: '',
        distribution_date: '',
        fee_type: 'percentual',
        fee_percentage: '30',
        fee_basis: 'condenacao',
        awarded_value: '',
        fee_fixed_value: '',
        fee_final_value: '',
        fee_paid: false,
        fee_has_entry: false,
        fee_entry_value: '',
        fee_entry_paid: false,
        fee_entry_date: '',
        fee_is_installment: false,
        fee_installments_count: '1',
        fee_due_date: '',
        fee_notify_due: true
      });
      fetchCases();
      setActionMessage({ type: 'success', text: 'Caso salvo com sucesso.' });
      addToast('Caso salvo com sucesso.', 'success');
    } catch (error) {
      const text = getErrorMessage(error, 'Erro ao salvar caso. Verifique os dados e tente novamente.');
      setActionMessage({ type: 'error', text });
      addToast(text, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEditCase = (caseItem) => {
    if (!canEdit) {
      console.warn('[CASES] Permissão negada para editar caso.');
      return;
    }
    const feeInfo = parseCaseFee(caseItem);
    setEditingCase(caseItem);
    setFormData({
      conversation_id: caseItem.conversation_id || '',
      title: caseItem.title || '',
      legal_area: caseItem.legal_area || '',
      case_type: caseItem.case_type || '',
      municipality: caseItem.municipality || '',
      agency: caseItem.agency || '',
      client_role: caseItem.client_role || '',
      status: caseItem.status || 'prospect',
      priority: caseItem.priority || 'media',
      deadline_date: caseItem.deadline_date || '',
      deadline_type: caseItem.deadline_type || '',
      notes: stripFeeFromNotes(caseItem.notes),
      process_number: caseItem.process_number || '',
      court: caseItem.court || '',
      court_division: caseItem.court_division || '',
      judicial_district: caseItem.judicial_district || '',
      procedural_step: caseItem.procedural_step || '',
      case_value: caseItem.case_value ?? '',
      distribution_date: caseItem.distribution_date || '',
      fee_type: feeInfo.fee_type || 'percentual',
      fee_percentage: feeInfo.fee_percentage != null ? String(feeInfo.fee_percentage) : '30',
      fee_basis: feeInfo.fee_basis || 'condenacao',
      awarded_value: feeInfo.awarded_value != null ? String(feeInfo.awarded_value) : '',
      fee_fixed_value: feeInfo.fee_fixed_value != null ? String(feeInfo.fee_fixed_value) : '',
      fee_final_value: feeInfo.fee_final_value != null ? String(feeInfo.fee_final_value) : '',
      fee_paid: feeInfo.fee_paid || false,
      fee_has_entry: feeInfo.fee_has_entry || false,
      fee_entry_value: feeInfo.fee_entry_value != null ? String(feeInfo.fee_entry_value) : '',
      fee_entry_paid: feeInfo.fee_entry_paid || false,
      fee_entry_date: feeInfo.fee_entry_date || '',
      fee_is_installment: feeInfo.fee_is_installment || false,
      fee_installments_count: feeInfo.fee_installments_count != null ? String(feeInfo.fee_installments_count) : '1',
      fee_due_date: feeInfo.fee_due_date || '',
      fee_notify_due: feeInfo.fee_notify_due !== false
    });
    setShowForm(true);
  };

  const handleDeleteCase = async (id) => {
    if (!canEdit) return;
    if (!confirm('Tem certeza que deseja deletar este caso?')) return;
    if (deleting) return;

    setDeleting(id);
    setActionMessage(null);
    try {
      const { error } = await supabase.from('cases').delete().eq('id', id);
      if (error) throw error;
      setSelectedCase(null);
      fetchCases();
      setActionMessage({ type: 'success', text: 'Caso removido com sucesso.' });
      addToast('Caso removido com sucesso.', 'success');
    } catch (error) {
      const text = getErrorMessage(error, 'Erro ao remover caso.');
      setActionMessage({ type: 'error', text });
      addToast(text, 'error');
    } finally {
      setDeleting(null);
    }
  };

  const handleClearDeadline = async (id) => {
    try {
      await apiJson(`/api/cases?id=${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ deadline_date: null, deadline_type: null })
      });
      addToast('Prazo/audiência marcado como realizado e data limpa com sucesso!', 'success');
      fetchCases();
      if (selectedCase && selectedCase.id === id) {
        setSelectedCase((prev) => ({ ...prev, deadline_date: null, deadline_type: null }));
      }
    } catch (err) {
      addToast('Erro ao atualizar prazo.', 'error');
    }
  };

  const handleCopyProcessNumber = async (processNumber) => {
    if (!processNumber) return;
    try {
      await navigator.clipboard.writeText(processNumber);
      addToast('Número do processo copiado.', 'success');
    } catch (error) {
      addToast('Não foi possível copiar o número do processo.', 'error');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      prospect: 'bg-gray-100 text-gray-800 border border-gray-200',
      em_analise: 'bg-blue-100 text-blue-800 border border-blue-200',
      proposta_enviada: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
      contrato_assinado: 'bg-purple-100 text-purple-800 border border-purple-200',
      acao_protocolada: 'bg-orange-100 text-orange-800 border border-orange-200',
      aguardando_decisao: 'bg-rose-100 text-rose-800 border border-rose-200',
      em_recurso: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
      em_execucao: 'bg-amber-100 text-amber-800 border border-amber-200',
      encerrado: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
      arquivado: 'bg-gray-100 text-gray-600 border border-gray-200'
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
    if (!canEdit || !selectedCase || !conversation || linking) return;

    setLinking(true);
    setActionMessage(null);
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
      setActionMessage({ type: 'success', text: 'Conversa vinculada com sucesso.' });
      addToast('Conversa vinculada com sucesso.', 'success');
    } catch (error) {
      const text = getErrorMessage(error, 'Erro ao vincular conversa. Verifique se a conversa está ativa e tente novamente.');
      setActionMessage({ type: 'error', text });
      addToast(text, 'error');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkConversation = async () => {
    if (!canEdit || !selectedCase || unlinking) return;

    setUnlinking(true);
    setActionMessage(null);
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
      setActionMessage({ type: 'success', text: 'Conversa removida do caso.' });
      addToast('Conversa removida do caso.', 'success');
    } catch (error) {
      const text = getErrorMessage(error, 'Não foi possível remover a conversa. Verifique se existem solicitações ou rotinas pendentes.');
      setActionMessage({ type: 'error', text });
      addToast(text, 'error');
    } finally {
      setUnlinking(false);
    }
  };

  if (selectedCase && caseView !== 'list' && caseView !== 'insights') {
    return (
      <div className="p-4 md:p-6 h-full w-full flex flex-col">
        {actionMessage && (
          <div
            className={`mb-4 p-3 rounded text-sm ${
              actionMessage.type === 'error'
                ? 'bg-red-100 text-red-700'
                : actionMessage.type === 'success'
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-800'
            }`}
            role={actionMessage.type === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            {actionMessage.text}
          </div>
        )}
        <CaseDetailPanel
          caseItem={selectedCase}
          caseView={caseView}
          onChangeView={updateCaseView}
          onBack={() => {
            setSelectedCase(null);
            setCaseView('list');
            const query = { ...router.query };
            delete query.caseId;
            delete query.caseView;
            router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
          }}
          onOpenChecklist={() => setChecklistCase(selectedCase)}
          onOpenDocuments={() => setDocsCase(selectedCase)}
          onOpenFee={() => setFeeCase(selectedCase)}
          userRole={profile?.role}
          conversations={conversations}
          onOpenConversationSelector={() => setShowConversationSelector(true)}
          onUnlinkConversation={handleUnlinkConversation}
          linking={linking}
          unlinking={unlinking}
          userCanEdit={canEdit}
        />

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

        {checklistCase && (
          <DocumentChecklist caseItem={checklistCase} onClose={() => setChecklistCase(null)} />
        )}

        {docsCase && (
          <CaseDocumentsPanel
            caseItem={docsCase}
            onClose={() => setDocsCase(null)}
          />
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
      {actionMessage && (
        <div
          className={`mb-4 p-3 rounded text-sm ${
            actionMessage.type === 'error'
              ? 'bg-red-100 text-red-700'
              : actionMessage.type === 'success'
              ? 'bg-green-100 text-green-700'
              : 'bg-yellow-100 text-yellow-800'
          }`}
          role={actionMessage.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {actionMessage.text}
        </div>
      )}
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
        <h2 className="text-xl sm:text-2xl font-bold">Casos</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setDecisionExtractorCase({ isGeneral: true })}
            className="px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded font-bold text-xs shadow-sm inline-flex items-center gap-1.5 transition"
            title="Extrair prazos, audiências, decisões e honorários usando IA"
          >
            <span>🤖</span> Analisar Decisão / Despacho (IA)
          </button>
          <ExportButtons
            onExcel={() => exportCasesExcel(cases)}
            disabled={loading || cases.length === 0}
          />
          {canEdit && (
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
                  notes: '',
                  process_number: '',
                  court: '',
                  court_division: '',
                  judicial_district: '',
                  procedural_step: '',
                  case_value: '',
                  distribution_date: ''
                });
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              + Novo Caso
            </button>
          )}
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
          <option value="em_recurso">Fase de Recurso</option>
          <option value="em_execucao">Fase de Execução</option>
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

        <select
          value={filters.court}
          onChange={(e) => setFilters({ ...filters, court: e.target.value })}
          className="px-3 py-2 border rounded"
        >
          <option value="">Todos os Tribunais</option>
          <option value="TRT">TRT</option>
          <option value="TRF">TRF</option>
          <option value="TJ">TJ</option>
          <option value="STJ">STJ</option>
          <option value="STF">STF</option>
          <option value="Outro">Outro</option>
        </select>

        <select
          value={filters.procedural_step}
          onChange={(e) => setFilters({ ...filters, procedural_step: e.target.value })}
          className="px-3 py-2 border rounded"
        >
          <option value="">Todas as Fases</option>
          <option value="conciliacao">Conciliação</option>
          <option value="instrucao">Instrução</option>
          <option value="sentenca">Sentença</option>
          <option value="recurso">Recurso</option>
          <option value="execucao">Execução</option>
          <option value="acordo">Acordo</option>
          <option value="outro">Outro</option>
        </select>
      </div>

      {/* Formulário Modal Centralizado */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto" onClick={() => { setShowForm(false); setEditingCase(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[90vh] overflow-y-auto p-5 md:p-6 text-gray-900 animate-fadeIn my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2 text-gray-900">
                <span>{editingCase ? '✏️' : '➕'}</span>
                <span>{editingCase ? `Editar Caso: ${editingCase.title}` : 'Novo Caso'}</span>
              </h3>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingCase(null); }}
                className="text-gray-400 hover:text-gray-700 text-xl p-1 rounded-lg hover:bg-gray-100 transition"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="ID da conversa (opcional)"
                value={formData.conversation_id}
                onChange={(e) => setFormData({ ...formData, conversation_id: e.target.value })}
                className="px-3 py-2 border rounded text-sm text-gray-900 bg-white"
              />
              <input
                type="text"
                placeholder="Título do caso *"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="px-3 py-2 border rounded text-sm font-semibold text-gray-900 bg-white"
                required
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
              <option value="em_recurso">Fase de Recurso</option>
              <option value="em_execucao">Fase de Execução / Cumprimento de Sentença</option>
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
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700">Próxima Audiência ou Prazo (opcional)</label>
                {formData.deadline_date && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, deadline_date: '', deadline_type: '' })}
                    className="text-[11px] text-red-600 hover:text-red-800 underline font-semibold"
                  >
                    ✕ Limpar prazo
                  </button>
                )}
              </div>
              <input
                type="date"
                value={formData.deadline_date || ''}
                onChange={(e) => setFormData({ ...formData, deadline_date: e.target.value })}
                className="px-3 py-2 border rounded text-sm text-gray-900 bg-white"
              />
              <span className="text-[10px] text-gray-500">
                Preencha apenas se houver audiência agendada ou prazo fatal. Se já ocorreu, deixe vazio.
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-700">Tipo de Prazo / Evento</label>
              <input
                type="text"
                placeholder="Ex: Audiência de Conciliação, Recurso, etc."
                value={formData.deadline_type || ''}
                onChange={(e) => setFormData({ ...formData, deadline_type: e.target.value })}
                className="px-3 py-2 border rounded text-sm"
              />
            </div>
            <textarea
              placeholder="Notas"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="px-3 py-2 border rounded col-span-2"
              rows="3"
            />

            <div className="col-span-2 border-t pt-4 mt-2">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Dados Processuais (Opcional)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Número do processo (CNJ)"
                  value={formData.process_number || ''}
                  onChange={(e) => setFormData({ ...formData, process_number: e.target.value })}
                  className="px-3 py-2 border rounded"
                />
                <select
                  value={formData.court || ''}
                  onChange={(e) => setFormData({ ...formData, court: e.target.value })}
                  className="px-3 py-2 border rounded"
                >
                  <option value="">Tribunal</option>
                  <option value="TRT">TRT</option>
                  <option value="TRF">TRF</option>
                  <option value="TJ">TJ</option>
                  <option value="STJ">STJ</option>
                  <option value="STF">STF</option>
                  <option value="Outro">Outro</option>
                </select>
                <input
                  type="text"
                  placeholder="Vara ou Juizado"
                  value={formData.court_division || ''}
                  onChange={(e) => setFormData({ ...formData, court_division: e.target.value })}
                  className="px-3 py-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Comarca"
                  value={formData.judicial_district || ''}
                  onChange={(e) => setFormData({ ...formData, judicial_district: e.target.value })}
                  className="px-3 py-2 border rounded"
                />
                <select
                  value={formData.procedural_step || ''}
                  onChange={(e) => setFormData({ ...formData, procedural_step: e.target.value })}
                  className="px-3 py-2 border rounded"
                >
                  <option value="">Fase processual</option>
                  <option value="conciliacao">Conciliação</option>
                  <option value="instrucao">Instrução</option>
                  <option value="sentenca">Sentença</option>
                  <option value="recurso">Recurso</option>
                  <option value="execucao">Execução</option>
                  <option value="acordo">Acordo</option>
                  <option value="outro">Outro</option>
                </select>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">Valor da Causa / Patrimônio (R$)</label>
                  <input
                    type="number"
                    placeholder="Valor total da causa (R$)"
                    min="0"
                    step="0.01"
                    value={formData.case_value ?? ''}
                    onChange={(e) => setFormData({ ...formData, case_value: e.target.value })}
                    className="px-3 py-2 border rounded text-sm text-gray-900 bg-white"
                  />
                  <span className="text-[10px] text-gray-500">
                    {formData.case_value ? `Honorários estimados (20% sucumbência/contratual): R$ ${(Number(formData.case_value) * 0.20).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Reflete o valor da ação. Honorários calculados em % ou no simulador.'}
                  </span>
                </div>
                <label className="flex flex-col text-xs text-gray-500 gap-1">
                  Data de distribuição
                  <input
                    type="date"
                    value={formData.distribution_date || ''}
                    onChange={(e) => setFormData({ ...formData, distribution_date: e.target.value })}
                    className="px-3 py-2 border rounded text-sm text-gray-900"
                  />
                </label>
              </div>

              {/* Seção de Honorários do Escritório */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span>💰 Configuração de Honorários Advocatícios</span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {(() => {
                      const preview = calculateFeeAmount({
                        fee_type: formData.fee_type,
                        fee_percentage: Number(formData.fee_percentage) || 0,
                        fee_basis: formData.fee_basis,
                        awarded_value: formData.awarded_value ? Number(formData.awarded_value) : null,
                        fee_fixed_value: formData.fee_fixed_value ? Number(formData.fee_fixed_value) : null,
                        case_value: formData.case_value
                      });
                      return `Honorários estimados: R$ ${preview.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    })()}
                  </span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de Honorários</label>
                    <select
                      value={formData.fee_type || 'percentual'}
                      onChange={(e) => setFormData({ ...formData, fee_type: e.target.value })}
                      className="w-full px-3 py-2 border rounded text-sm text-gray-900 bg-white"
                    >
                      <option value="percentual">Percentual (%)</option>
                      <option value="fixo">Valor Fixo (R$)</option>
                    </select>
                  </div>

                  {formData.fee_type === 'percentual' ? (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Percentual (%)</label>
                        <div className="flex gap-1.5">
                          <input
                            type="number"
                            step="1"
                            min="1"
                            max="100"
                            placeholder="30"
                            value={formData.fee_percentage || ''}
                            onChange={(e) => setFormData({ ...formData, fee_percentage: e.target.value })}
                            className="w-full px-3 py-2 border rounded text-sm text-gray-900 bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, fee_percentage: '20' })}
                            className={`px-2 py-1 rounded text-xs font-bold border ${formData.fee_percentage === '20' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-gray-300 text-gray-700'}`}
                          >
                            20%
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, fee_percentage: '30' })}
                            className={`px-2 py-1 rounded text-xs font-bold border ${formData.fee_percentage === '30' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-gray-300 text-gray-700'}`}
                          >
                            30%
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Base de Cálculo</label>
                        <select
                          value={formData.fee_basis || 'condenacao'}
                          onChange={(e) => setFormData({ ...formData, fee_basis: e.target.value })}
                          className="w-full px-3 py-2 border rounded text-sm text-gray-900 bg-white"
                        >
                          <option value="condenacao">Sobre Condenação / Acordo (Recomendado)</option>
                          <option value="causa">Sobre o Valor da Causa</option>
                        </select>
                      </div>
                    </>
                  ) : (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Valor Fixo em Reais (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Ex: 3000.00"
                        value={formData.fee_fixed_value || ''}
                        onChange={(e) => setFormData({ ...formData, fee_fixed_value: e.target.value })}
                        className="w-full px-3 py-2 border rounded text-sm text-gray-900 bg-white font-mono"
                      />
                    </div>
                  )}
                </div>

                {/* Opções de Pagamento, Entrada, Parcelamento e Notificação */}
                <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-white border border-gray-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!formData.fee_paid}
                        onChange={(e) => setFormData({ ...formData, fee_paid: e.target.checked })}
                        className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-gray-900">
                        Honorários 100% Pagos / Recebidos (marcar se já recebeu o valor integral)
                      </span>
                    </label>
                    {formData.fee_paid && (
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                        ✓ Quitado / Recebido
                      </span>
                    )}
                  </div>

                  {!formData.fee_paid && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      {/* Opção de Entrada */}
                      <div className="p-3 bg-white rounded-lg border border-gray-200 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-gray-800">
                          <input
                            type="checkbox"
                            checked={!!formData.fee_has_entry}
                            onChange={(e) => setFormData({ ...formData, fee_has_entry: e.target.checked })}
                            className="h-3.5 w-3.5 rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>Cobrança de Valor de Entrada</span>
                        </label>

                        {formData.fee_has_entry && (
                          <div className="space-y-2 pt-1 text-xs">
                            <div>
                              <label className="block text-[11px] text-gray-600 font-medium mb-0.5">Valor da Entrada (R$):</label>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="Ex: 1000.00"
                                value={formData.fee_entry_value || ''}
                                onChange={(e) => setFormData({ ...formData, fee_entry_value: e.target.value })}
                                className="w-full p-1.5 border rounded text-xs font-mono bg-gray-50 text-gray-900"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="fee_entry_paid_input"
                                checked={!!formData.fee_entry_paid}
                                onChange={(e) => setFormData({ ...formData, fee_entry_paid: e.target.checked })}
                                className="rounded text-emerald-600"
                              />
                              <label htmlFor="fee_entry_paid_input" className="text-[11px] text-gray-700 cursor-pointer font-medium">
                                Entrada já foi paga pelo cliente
                              </label>
                            </div>
                            <div>
                              <label className="block text-[11px] text-gray-600 font-medium mb-0.5">Data de Vencimento / Pagamento da Entrada:</label>
                              <input
                                type="date"
                                value={formData.fee_entry_date || ''}
                                onChange={(e) => setFormData({ ...formData, fee_entry_date: e.target.value })}
                                className="w-full p-1.5 border rounded text-xs bg-gray-50 text-gray-900"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Opção de Parcelamento */}
                      <div className="p-3 bg-white rounded-lg border border-gray-200 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-gray-800">
                          <input
                            type="checkbox"
                            checked={!!formData.fee_is_installment}
                            onChange={(e) => setFormData({ ...formData, fee_is_installment: e.target.checked })}
                            className="h-3.5 w-3.5 rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>Honorários Parcelados</span>
                        </label>

                        {formData.fee_is_installment && (
                          <div className="space-y-2 pt-1 text-xs">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] text-gray-600 font-medium mb-0.5">Qtd de Parcelas:</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="60"
                                  placeholder="Ex: 3"
                                  value={formData.fee_installments_count || '1'}
                                  onChange={(e) => setFormData({ ...formData, fee_installments_count: e.target.value })}
                                  className="w-full p-1.5 border rounded text-xs font-mono bg-gray-50 text-gray-900"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-gray-600 font-medium mb-0.5">1º Vencimento:</label>
                                <input
                                  type="date"
                                  value={formData.fee_due_date || ''}
                                  onChange={(e) => setFormData({ ...formData, fee_due_date: e.target.value })}
                                  className="w-full p-1.5 border rounded text-xs bg-gray-50 text-gray-900"
                                />
                              </div>
                            </div>

                            {formData.fee_fixed_value && (
                              <div className="p-2 bg-indigo-50/70 border border-indigo-100 rounded text-[11px] text-indigo-900 font-semibold">
                                {(() => {
                                  const total = Number(formData.fee_fixed_value) || 0;
                                  const entrada = formData.fee_has_entry ? (Number(formData.fee_entry_value) || 0) : 0;
                                  const restante = Math.max(0, total - entrada);
                                  const parcelas = Number(formData.fee_installments_count) || 1;
                                  const valorParcela = restante / parcelas;
                                  return `Restante a parcelar: R$ ${restante.toFixed(2)} (${parcelas}x de R$ ${valorParcela.toFixed(2)})`;
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Indicação por Notificação */}
                  <div className="pt-1 flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 cursor-pointer text-gray-700 font-medium">
                      <input
                        type="checkbox"
                        checked={formData.fee_notify_due !== false}
                        onChange={(e) => setFormData({ ...formData, fee_notify_due: e.target.checked })}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span>🔔 Gerar notificação e alerta de vencimento para este pagamento</span>
                    </label>
                  </div>
                </div>

                {formData.fee_type === 'percentual' && formData.fee_basis === 'condenacao' && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Valor da Condenação / Acordo Obtido (R$) - preenchido após decisão/sentença
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Ex: 6207.59 (como no caso de Amanda)"
                      value={formData.awarded_value || ''}
                      onChange={(e) => setFormData({ ...formData, awarded_value: e.target.value })}
                      className="w-full md:w-1/2 px-3 py-2 border rounded text-sm text-gray-900 bg-white font-mono"
                    />
                    <span className="block text-[11px] text-gray-500 mt-1">
                      Quando preenchido, os honorários serão calculados exatamente sobre este montante (ex: {formData.fee_percentage || 30}% sobre {formData.awarded_value ? `R$ ${Number(formData.awarded_value).toFixed(2)}` : 'R$ 0,00'}).
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingCase(null);
              }}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveCase}
              disabled={saving}
              title={saving ? 'Salvando...' : 'Salvar caso'}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-md transition disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
            {saving && <span id="saving-hint" className="sr-only">Salvando o caso, aguarde.</span>}
          </div>
        </div>
      </div>
      )}

      {loading ? (
        <div className="text-center p-8" role="status" aria-live="polite">
          <p className="text-gray-500">Carregando casos...</p>
        </div>
      ) : cases.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 border rounded" role="status" aria-live="polite">
          <p className="text-gray-600 font-medium">Nenhum caso encontrado</p>
          <p className="text-sm text-gray-500 mt-1">Crie um novo caso ou ajuste os filtros para começar.</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 text-xs md:text-sm">
                <th className="border p-3 text-left">Título</th>
                <th className="border p-2.5 text-left text-[11px] font-bold text-gray-700">Área</th>
                <th className="border p-2.5 text-left text-[11px] font-bold text-gray-700">Status</th>
                <th className="border p-2.5 text-left text-[11px] font-bold text-gray-700">Prioridade</th>
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
                      {(caseItem.process_number || caseItem.court || caseItem.procedural_step) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {caseItem.process_number && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                              <span className="font-mono">{caseItem.process_number}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleCopyProcessNumber(caseItem.process_number); }}
                                title="Copiar número do processo"
                                className="px-1 py-0.5 text-[10px] bg-gray-100 hover:bg-gray-200 rounded border border-gray-300"
                              >
                                Copiar
                              </button>
                            </span>
                          )}
                          {caseItem.court && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
                              {caseItem.court}
                            </span>
                          )}
                          {caseItem.procedural_step && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                              {PROCEDURAL_STEP_LABELS[caseItem.procedural_step] || caseItem.procedural_step}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="border p-2 text-[11px] text-gray-700">{caseItem.legal_area || '-'}</td>
                    <td className="border p-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${getStatusColor(caseItem.status)}`}>
                        {STATUS_LABELS[caseItem.status] || caseItem.status}
                      </span>
                    </td>
                    <td className="border p-2">
                      <span className={`text-[11px] font-bold ${getPriorityColor(caseItem.priority)}`}>
                        {caseItem.priority}
                      </span>
                    </td>
                    <td className="border p-3">
                      {caseItem.deadline_date ? (
                        <div>
                          <div className={caseItem.status === 'encerrado' || caseItem.status === 'arquivado' ? 'text-gray-400 line-through text-xs' : 'font-medium text-gray-900 text-sm'}>
                            {formatDate(caseItem.deadline_date)}
                          </div>
                          {caseItem.status === 'encerrado' || caseItem.status === 'arquivado' ? (
                            <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1 mt-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 w-fit">
                              <span>✓</span> Encerrado / Concluído
                            </div>
                          ) : (
                            <>
                              {daysLeft !== null && (
                                <div className={`text-xs mt-0.5 ${daysLeft < 0 ? 'text-red-600 font-bold' : daysLeft < 7 ? 'text-orange-600 font-medium' : 'text-gray-600'}`}>
                                  {daysLeft < 0 ? `${Math.abs(daysLeft)} dias atrasado` : `${daysLeft} dias restantes`}
                                </div>
                              )}
                              {canEdit && daysLeft !== null && daysLeft < 0 && (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!confirm(`Deseja marcar este prazo/audiência de "${caseItem.title}" como concluído e limpar a data? O processo continuará ativo.`)) return;
                                    await handleClearDeadline(caseItem.id);
                                  }}
                                  className="mt-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 block w-fit"
                                  title="Marcar audiência/prazo como realizado e limpar data"
                                >
                                  ✓ Concluir / Limpar
                                </button>
                              )}
                              <div className="mt-1">
                                <CaseCalendarSync
                                  eventId={caseItem.id}
                                  table="cases"
                                  deadlineDate={caseItem.deadline_date}
                                  title={caseItem.title}
                                  internalUpdatedAt={caseItem.updated_at}
                                />
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Sem prazo pendente</span>
                      )}
                    </td>
                    <td className="border p-2">
                      <div className="grid grid-cols-5 gap-1.5 min-w-[420px]">
                        {/* Linha 1 */}
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleEditCase(caseItem); }}
                            className="h-7 w-full flex items-center justify-center text-[11px] font-bold rounded shadow-xs bg-blue-600 hover:bg-blue-700 text-white transition"
                            title="Editar detalhes do caso"
                          >
                            Editar
                          </button>
                        ) : <div className="h-7" />}

                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setChecklistCase(caseItem); }}
                          className="h-7 w-full flex items-center justify-center text-[11px] font-bold rounded shadow-xs bg-teal-600 hover:bg-teal-700 text-white transition"
                          title="Checklist de pendências"
                        >
                          Checklist
                        </button>

                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDocsCase(caseItem); }}
                          className="h-7 w-full flex items-center justify-center text-[11px] font-bold rounded shadow-xs bg-amber-500 hover:bg-amber-600 text-white transition"
                          title="Documentos anexados"
                        >
                          Documentos
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!caseItem.conversation_id) {
                              alert('Caso sem conversa vinculada. Vincule uma conversa antes de solicitar documentos.');
                              return;
                            }
                            setRequestCase(caseItem);
                          }}
                          className="h-7 w-full flex items-center justify-center text-[11px] font-bold rounded shadow-xs bg-cyan-600 hover:bg-cyan-700 text-white transition"
                          title="Solicitar informações ao cliente"
                        >
                          Solicitar
                        </button>

                        {caseItem.status !== 'encerrado' && caseItem.status !== 'arquivado' ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setFinalizeCase(caseItem); }}
                            className="h-7 w-full flex items-center justify-center text-[11px] font-bold rounded shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white transition"
                            title="Finalizar e encerrar processo judicial"
                          >
                            🏁 Finalizar
                          </button>
                        ) : (
                          <span className="h-7 w-full flex items-center justify-center text-[11px] font-bold rounded border border-emerald-300 bg-emerald-50 text-emerald-800">
                            ✓ Encerrado
                          </span>
                        )}

                        {/* Linha 2 */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setFeeCase(caseItem); }}
                          className="h-7 w-full flex items-center justify-center text-[11px] font-bold rounded shadow-xs bg-emerald-700 hover:bg-emerald-800 text-white transition"
                          title="Simulador e gestão de honorários"
                        >
                          Honorários
                        </button>

                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setProcessCase(caseItem); }}
                          className="h-7 w-full flex items-center justify-center text-[11px] font-bold rounded shadow-xs bg-indigo-600 hover:bg-indigo-700 text-white transition"
                          title="Monitoramento e movimentações processuais"
                        >
                          Processo
                        </button>

                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDecisionExtractorCase(caseItem); }}
                          className="h-7 w-full flex items-center justify-center text-[11px] font-bold rounded shadow-xs bg-purple-600 hover:bg-purple-700 text-white transition"
                          title="Analisar despacho ou decisão com Inteligência Artificial"
                        >
                          🤖 IA Decisão
                        </button>

                        {canEdit ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeleteCase(caseItem.id); }}
                            className="h-7 w-full flex items-center justify-center text-[11px] font-bold rounded shadow-xs bg-red-600 hover:bg-red-700 text-white transition"
                            title="Excluir caso"
                          >
                            Deletar
                          </button>
                        ) : <div className="h-7" />}

                        <div className="h-7" />
                      </div>
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
        <DocumentRequestModal
          caseItem={requestCase}
          conversation={conversations.find(c => c.id === requestCase.conversation_id)}
          onClose={() => setRequestCase(null)}
        />
      )}

      {showConversationSelector && selectedCase && (
        <ConversationSelectorModal
          caseItem={selectedCase}
          onSelect={handleLinkConversation}
          onClose={() => setShowConversationSelector(false)}
        />
      )}

      {decisionExtractorCase && (
        <CaseDecisionExtractorModal
          caseItem={decisionExtractorCase?.id ? decisionExtractorCase : null}
          allCases={cases}
          onClose={() => setDecisionExtractorCase(null)}
          onRefresh={fetchCases}
        />
      )}

      {finalizeCase && (
        <CaseFinalizeModal
          caseItem={finalizeCase}
          onClose={() => setFinalizeCase(null)}
          onRefresh={fetchCases}
        />
      )}
    </div>
  );
}
