import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import { getAuthHeaders } from '../lib/api';
import { buildInternalUrl } from '../lib/router';

const TRIAGE_STATUS_LABELS = {
  novo: 'Nova',
  em_analise: 'Em análise',
  revisado: 'Revisada',
  ignorado: 'Ignorada',
  convertido_em_nota: 'Convertida em nota',
  convertido_em_lembrete: 'Convertida em lembrete',
  convertido_em_agenda: 'Convertida em agenda'
};

const STATUS_STYLES = {
  novo: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  em_analise: 'bg-blue-100 text-blue-800 border-blue-200',
  revisado: 'bg-green-100 text-green-800 border-green-200',
  ignorado: 'bg-gray-100 text-gray-700 border-gray-200',
  convertido_em_nota: 'bg-purple-100 text-purple-800 border-purple-200',
  convertido_em_lembrete: 'bg-pink-100 text-pink-800 border-pink-200',
  convertido_em_agenda: 'bg-orange-100 text-orange-800 border-orange-200'
};

const PRIORITY_LABELS = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente'
};

const PRIORITY_STYLES = {
  baixa: 'bg-green-50 text-green-800 border-green-200',
  media: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  alta: 'bg-orange-50 text-orange-800 border-orange-200',
  urgente: 'bg-red-50 text-red-800 border-red-200'
};

const PRIORITY_WEIGHT = { urgente: 0, alta: 1, media: 2, baixa: 3 };

const CLASSIFICATION_LABELS = {
  ainda_nao_classificada: 'Ainda não classificada',
  intimacao: 'Intimação',
  prazo_potencial: 'Prazo Potencial',
  audiencia: 'Audiência',
  pericia: 'Perícia',
  despacho: 'Despacho',
  decisao: 'Decisão',
  sentenca: 'Sentença',
  juntada: 'Juntada',
  peticao: 'Petição',
  citacao: 'Citação',
  acordo: 'Acordo',
  baixa_arquivado: 'Baixa/Arquivado',
  movimentacao_administrativa: 'Mov. Administrativa',
  duplicada: 'Duplicada',
  irrelevante: 'Irrelevante',
  outro: 'Outro'
};

const ACTION_LABELS = {
  assume: 'Assumir',
  assign: 'Atribuir',
  analyze: 'Iniciar análise',
  review: 'Marcar como revisada',
  ignore: 'Ignorar',
  note: 'Criar nota',
  event: 'Criar agenda',
  openCase: 'Abrir caso'
};

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR');
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR');
}

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

function safeDate(d) {
  if (!d) return null;
  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function sortMovements(movements, sortBy) {
  const list = [...(movements || [])];
  list.sort((a, b) => {
    const aWeight = PRIORITY_WEIGHT[a.priority] ?? 2;
    const bWeight = PRIORITY_WEIGHT[b.priority] ?? 2;

    if (sortBy === 'priority') {
      if (aWeight !== bWeight) return aWeight - bWeight;
      const dateA = a.movement_date ? new Date(a.movement_date).getTime() : 0;
      const dateB = b.movement_date ? new Date(b.movement_date).getTime() : 0;
      if (dateB !== dateA) return dateB - dateA;
      const detA = a.detected_at ? new Date(a.detected_at).getTime() : 0;
      const detB = b.detected_at ? new Date(b.detected_at).getTime() : 0;
      return detB - detA;
    }

    const fieldA = new Date(a[sortBy] || 0).getTime();
    const fieldB = new Date(b[sortBy] || 0).getTime();
    return fieldB - fieldA;
  });
  return list;
}

function filterBySearch(movements, query) {
  if (!query?.trim()) return movements;
  const q = query.toLowerCase().trim();
  return movements.filter((m) => {
    const court = (m.case_process?.court_name || '').toLowerCase();
    const courtCode = (m.case_process?.court_code || '').toLowerCase();
    const area = (m.case_process?.case?.legal_area || '').toLowerCase();
    const caseTitle = (m.case_process?.case?.title || '').toLowerCase();
    const classification = (m.legal_classification || '').toLowerCase();
    const status = (m.triage_status || '').toLowerCase();
    const priority = (m.priority || '').toLowerCase();
    const id = (m.id || '').toLowerCase();
    const assigned = (m.assigned_user?.name || '').toLowerCase();
    return id === q ||
      classification.includes(q) ||
      status.includes(q) ||
      priority.includes(q) ||
      court.includes(q) ||
      courtCode.includes(q) ||
      area.includes(q) ||
      caseTitle.includes(q) ||
      assigned.includes(q);
  });
}

function ConfirmModal({ title, children, onCancel, onConfirm, loading, confirmText, disabled }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onCancel} role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-nc-white rounded-lg max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-nc-text-title mb-3">{title}</h3>
        {children && <div className="text-sm text-nc-text mb-4">{children}</div>}
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="nc-btn text-sm" disabled={loading}>Cancelar</button>
          <button onClick={onConfirm} className="nc-btn-primary text-sm" disabled={loading || disabled} data-testid="confirm-action">
            {loading ? 'Aguarde...' : (confirmText || 'Confirmar')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProcessTriagePanel({ movementId, profile }) {
  const router = useRouter();
  const role = profile?.role || 'estagiario';
  const userId = profile?.id;
  const userName = profile?.name;
  const canAct = role === 'admin' || role === 'advogado';

  const [movements, setMovements] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState(null);
  const [partialError, setPartialError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    triage_status: '',
    legal_classification: '',
    priority: '',
    legal_area: '',
    court_code: '',
    assigned_user_id: '',
    period: '',
    start_date: '',
    end_date: ''
  });
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('priority');
  const [users, setUsers] = useState([]);
  const [highlightedId, setHighlightedId] = useState(null);
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [history, setHistory] = useState([]);
  const [showDetail, setShowDetail] = useState(false);
  const [actionModal, setActionModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionForm, setActionForm] = useState({});
  const [message, setMessage] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const highlightedRef = useRef(null);

  const fetchUsers = async () => {
    if (!canAct) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/collaboration?action=users', { headers });
      if (res.ok) {
        const data = await res.json();
        setUsers((data.users || []).filter((u) => u.id !== userId));
      }
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const buildParams = (pageNum = 1) => {
    const params = new URLSearchParams({ action: 'list', page: String(pageNum), limit: '20' });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        if (key === 'assigned_user_id') {
          if (value === 'mine') {
            params.append('mine', 'true');
          } else if (value === 'unassigned') {
            params.append('assigned_user_id', 'unassigned');
          } else {
            params.append('assigned_user_id', value);
          }
        } else if (key === 'period') {
          const today = new Date();
          const end = safeDate(today);
          let start = '';
          if (value === 'today') {
            start = end;
          } else if (value === '7') {
            const d = new Date(today);
            d.setDate(d.getDate() - 7);
            start = safeDate(d);
          } else if (value === '30') {
            const d = new Date(today);
            d.setDate(d.getDate() - 30);
            start = safeDate(d);
          }
          if (start) {
            params.append('start_date', start);
            params.append('end_date', end);
          }
        } else if (!['period', 'start_date', 'end_date'].includes(key)) {
          params.append(key, value);
        }
      }
    });
    return params;
  };

  const fetchMovements = async (pageNum = 1, append = false) => {
    if (pageNum === 1) {
      setLoading(true);
      setInitialLoad(false);
    } else {
      setLoadingMore(true);
    }
    setPartialError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/triage?${buildParams(pageNum)}`, { headers });
      const data = await res.json();
      if (res.ok) {
        const next = data.movements || [];
        if (append) {
          setMovements((prev) => {
            const existing = new Set(prev.map((m) => m.id));
            const merged = [...prev];
            next.forEach((m) => {
              if (!existing.has(m.id)) merged.push(m);
            });
            return merged;
          });
        } else {
          setMovements(next);
        }
        setTotalPages(data.totalPages || 1);
        setPage(pageNum);
      } else {
        if (pageNum === 1) {
          setError('Não foi possível atualizar a triagem. Tente novamente.');
        } else {
          setPartialError('Não foi possível atualizar a triagem. Tente novamente.');
        }
      }
    } catch (err) {
      console.error('[TRIAGE] Erro ao carregar movimentações');
      if (pageNum === 1) {
        setError('Não foi possível atualizar a triagem. Tente novamente.');
      } else {
        setPartialError('Não foi possível atualizar a triagem. Tente novamente.');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const fetchStats = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/triage?action=stats', { headers });
      const data = await res.json();
      if (res.ok) setStats(data);
    } catch (err) {
      console.error('[TRIAGE] Stats error:', err);
    }
  };

  useEffect(() => {
    fetchMovements(1, false);
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    if (!movementId) return;
    if (movements.length === 0) return;
    const found = movements.find((m) => m.id === movementId);
    if (found) {
      setHighlightedId(movementId);
      const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setTimeout(() => {
        const el = document.getElementById(`triage-card-${movementId}`);
        if (el) {
          el.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' });
        }
      }, 100);
      const t = setTimeout(() => setHighlightedId(null), 4000);
      return () => clearTimeout(t);
    } else {
      setMessage({ type: 'warning', text: 'Movimentação não encontrada ou não disponível.' });
      const t = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(t);
    }
  }, [movementId, movements]);

  useEffect(() => {
    if (highlightedId && highlightedRef.current) {
      highlightedRef.current.focus();
    }
  }, [highlightedId]);

  const openDetail = async (mov) => {
    setSelectedMovement(mov);
    setShowDetail(true);
    setSuggestion(null);
    setActionForm({});
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/triage?id=${mov.id}`, { headers });
      const data = await res.json();
      if (res.ok) {
        setSelectedMovement(data.movement);
        setHistory(data.history || []);
      } else {
        setMessage({ type: 'error', text: 'Não foi possível carregar os detalhes. Tente novamente.' });
      }
    } catch (err) {
      console.error('[TRIAGE] Detalhes:', err);
      setMessage({ type: 'error', text: 'Erro ao carregar detalhes' });
    }
  };

  const closeDetail = () => {
    setShowDetail(false);
    setSelectedMovement(null);
    setHistory([]);
    setSuggestion(null);
    setMessage(null);
    setActionForm({});
  };

  const handleActionClick = (type, mov) => {
    setSelectedMovement(mov);
    setActionModal(type);
    setActionForm({});
    setMessage(null);
    setSuggestion(null);
  };

  const closeAction = () => {
    setActionModal(null);
    setSubmitting(false);
    setSuggestion(null);
    setActionForm({});
  };

  const callPatch = async (body) => {
    if (!selectedMovement) return false;
    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/triage?id=${selectedMovement.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Ação registrada com sucesso' });
        await fetchMovements(page, false);
        await fetchStats();
        closeAction();
        return true;
      } else {
        setMessage({ type: 'error', text: data.error || 'Erro ao executar ação' });
        return false;
      }
    } catch (err) {
      console.error('[TRIAGE] Ação:', err);
      setMessage({ type: 'error', text: 'Erro ao executar ação' });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const callPost = async (action, body) => {
    if (!selectedMovement) return false;
    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/triage?action=${action}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, movement_id: selectedMovement.id })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Ação registrada com sucesso' });
        await fetchMovements(page, false);
        await fetchStats();
        closeAction();
        return true;
      } else {
        setMessage({ type: 'error', text: data.error || 'Erro ao executar ação' });
        return false;
      }
    } catch (err) {
      console.error('[TRIAGE] Ação:', err);
      setMessage({ type: 'error', text: 'Erro ao executar ação' });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const onConfirmAction = async () => {
    if (actionModal === 'assume') {
      if (!userId) return;
      return callPatch({ assigned_user_id: userId });
    }
    if (actionModal === 'assign') {
      if (!actionForm.assignedUserId) return;
      return callPatch({ assigned_user_id: actionForm.assignedUserId });
    }
    if (actionModal === 'analyze') {
      return callPatch({ triage_status: 'em_analise' });
    }
    if (actionModal === 'review') {
      return callPatch({ triage_status: 'revisado' });
    }
    if (actionModal === 'ignore') {
      return callPatch({ triage_status: 'ignorado' });
    }
    if (actionModal === 'note') {
      if (!actionForm.noteText) return;
      return callPost('create_note', { text: actionForm.noteText, is_visible_to_client: false });
    }
    if (actionModal === 'event') {
      if (!actionForm.event_date || !actionForm.event_type) return;
      return callPost('create_event', {
        event_date: actionForm.event_date,
        event_time: actionForm.event_time || '',
        event_type: actionForm.event_type,
        description: actionForm.description || '',
        priority: actionForm.priority || 'media',
        location: actionForm.location || ''
      });
    }
    return false;
  };

  const getSuggestion = async () => {
    if (!selectedMovement) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/triage?action=suggest', {
        method: 'POST',
        headers,
        body: JSON.stringify({ movement_text: selectedMovement.movement_text })
      });
      const data = await res.json();
      if (res.ok) setSuggestion(data);
    } catch (err) {
      console.error('[TRIAGE] Sugestão:', err);
    }
  };

  const handleSummaryClick = (key) => {
    if (key === 'mine') {
      setFilters((f) => ({ ...f, assigned_user_id: 'mine', page: 1 }));
    } else if (key === 'urgent') {
      setFilters((f) => ({ ...f, priority: 'urgente', page: 1 }));
    } else if (key === 'new') {
      setFilters((f) => ({ ...f, triage_status: 'novo', page: 1 }));
    } else if (key === 'analyzing') {
      setFilters((f) => ({ ...f, triage_status: 'em_analise', page: 1 }));
    } else {
      setFilters((f) => ({ ...f, page: 1 }));
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({
      triage_status: '', legal_classification: '', priority: '', legal_area: '', court_code: '',
      assigned_user_id: '', period: '', start_date: '', end_date: ''
    });
    setSearch('');
    setSortBy('priority');
  };

  const visibleMovements = useMemo(() => {
    const sorted = sortMovements(movements, sortBy);
    return filterBySearch(sorted, search);
  }, [movements, sortBy, search]);

  const renderActionModal = () => {
    if (!actionModal || !selectedMovement) return null;

    if (actionModal === 'note') {
      return (
        <ConfirmModal title="Criar nota interna vinculada a esta movimentação?" onCancel={closeAction} onConfirm={onConfirmAction} loading={submitting} confirmText="Criar nota" disabled={!actionForm.noteText}>
          <p className="mb-2">Texto da nota:</p>
          <textarea
            value={actionForm.noteText || ''}
            onChange={(e) => setActionForm((s) => ({ ...s, noteText: e.target.value }))}
            className="nc-input w-full resize-none"
            rows={4}
            placeholder="Digite a nota..."
            data-testid="note-textarea"
          />
        </ConfirmModal>
      );
    }

    if (actionModal === 'event') {
      return (
        <ConfirmModal title="Criar evento na agenda a partir desta movimentação?" onCancel={closeAction} onConfirm={onConfirmAction} loading={submitting} confirmText="Criar evento" disabled={!actionForm.event_date || !actionForm.event_type}>
          <div className="space-y-3">
            <input type="date" value={actionForm.event_date || ''} onChange={(e) => setActionForm((s) => ({ ...s, event_date: e.target.value }))} className="nc-input w-full" data-testid="event-date" />
            <input type="time" value={actionForm.event_time || ''} onChange={(e) => setActionForm((s) => ({ ...s, event_time: e.target.value }))} className="nc-input w-full" />
            <select value={actionForm.event_type || 'audiencia'} onChange={(e) => setActionForm((s) => ({ ...s, event_type: e.target.value }))} className="nc-input w-full" data-testid="event-type">
              <option value="audiencia">Audiência</option>
              <option value="prazo_judicial">Prazo Judicial</option>
              <option value="reuniao">Reunião</option>
              <option value="pericia">Perícia</option>
              <option value="outro">Outro</option>
            </select>
            <select value={actionForm.priority || 'media'} onChange={(e) => setActionForm((s) => ({ ...s, priority: e.target.value }))} className="nc-input w-full">
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
            <input type="text" value={actionForm.location || ''} onChange={(e) => setActionForm((s) => ({ ...s, location: e.target.value }))} className="nc-input w-full" placeholder="Local" />
            <textarea value={actionForm.description || ''} onChange={(e) => setActionForm((s) => ({ ...s, description: e.target.value }))} className="nc-input w-full resize-none" rows={3} placeholder="Descrição" />
          </div>
        </ConfirmModal>
      );
    }

    if (actionModal === 'assign') {
      return (
        <ConfirmModal title="Atribuir responsável" onCancel={closeAction} onConfirm={onConfirmAction} loading={submitting} confirmText="Atribuir" disabled={!actionForm.assignedUserId}>
          <p className="mb-2">Selecione o responsável:</p>
          <select value={actionForm.assignedUserId || ''} onChange={(e) => setActionForm((s) => ({ ...s, assignedUserId: e.target.value }))} className="nc-input w-full" data-testid="assign-select">
            <option value="">Selecione...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </ConfirmModal>
      );
    }

    const titles = {
      assume: 'Assumir esta movimentação?',
      analyze: 'Iniciar análise desta movimentação?',
      review: 'Marcar esta movimentação como revisada?',
      ignore: 'Ignorar esta movimentação?'
    };
    return (
      <ConfirmModal title={titles[actionModal]} onCancel={closeAction} onConfirm={onConfirmAction} loading={submitting} confirmText={ACTION_LABELS[actionModal]}>
        <p>Esta ação será registrada no histórico e não pode ser desfeita.</p>
      </ConfirmModal>
    );
  };

  if (role === 'estagiario') {
    return (
      <div className="flex-1 flex flex-col bg-nc-gray-50 p-8 items-center justify-center">
        <div className="bg-nc-white p-6 rounded-lg shadow max-w-md text-center">
          <h2 className="text-lg font-semibold text-nc-text-title mb-2">Acesso restrito</h2>
          <p className="text-sm text-nc-text-secondary">A Central de Triagem Processual não está disponível para estagiários.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-nc-gray-50 overflow-hidden" data-testid="triage-panel">
      <div className="bg-nc-white border-b border-nc-gray-200 p-4">
        <h1 className="text-2xl font-bold text-nc-text-title">⏱️ Central de Triagem Processual</h1>
        <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded text-sm text-blue-900" role="note" data-testid="triage-disclaimer">
          Esta central reúne movimentações processuais para revisão humana. Sugestões de classificação e prioridade são apenas apoio operacional; confirme sempre no processo e no sistema oficial do tribunal. Nenhum prazo ou evento é criado automaticamente.
        </div>
      </div>

      {message && (
        <div className={cx('p-3 text-sm border-b', message.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-yellow-50 text-yellow-800 border-yellow-200')} data-testid="triage-message">
          {message.text}
        </div>
      )}

      {stats && (
        <div className="bg-nc-white border-b border-nc-gray-200 p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { key: 'total', label: 'Total', value: stats.total || 0, class: 'bg-nc-gray-50' },
              { key: 'new', label: 'Novas', value: stats.by_status?.novo || 0, class: 'bg-yellow-50' },
              { key: 'analyzing', label: 'Em análise', value: stats.by_status?.em_analise || 0, class: 'bg-blue-50' },
              { key: 'urgent', label: 'Alta/Urgente', value: (stats.by_priority?.alta || 0) + (stats.by_priority?.urgente || 0), class: 'bg-red-50' },
              { key: 'mine', label: 'Minhas pendências', value: stats.my_pendencies || 0, class: 'bg-purple-50' }
            ].map((c) => (
              <button
                key={c.key}
                onClick={() => handleSummaryClick(c.key)}
                className={cx('p-3 rounded text-left hover:shadow transition border border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400', c.class)}
                data-testid={`summary-${c.key}`}
                aria-label={`Filtrar ${c.label}`}
              >
                <div className="text-xs text-nc-text-secondary">{c.label}</div>
                <div className="text-2xl font-bold text-nc-text-title">{c.value}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-nc-white border-b border-nc-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
          <select value={filters.triage_status} onChange={(e) => handleFilterChange('triage_status', e.target.value)} className="nc-input text-sm" data-testid="filter-status" aria-label="Filtrar por status">
            <option value="">Todos os status</option>
            {Object.entries(TRIAGE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filters.priority} onChange={(e) => handleFilterChange('priority', e.target.value)} className="nc-input text-sm" data-testid="filter-priority" aria-label="Filtrar por prioridade">
            <option value="">Todas as prioridades</option>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filters.legal_classification} onChange={(e) => handleFilterChange('legal_classification', e.target.value)} className="nc-input text-sm" data-testid="filter-classification" aria-label="Filtrar por classificação">
            <option value="">Todas as classificações</option>
            {Object.entries(CLASSIFICATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filters.assigned_user_id} onChange={(e) => handleFilterChange('assigned_user_id', e.target.value)} className="nc-input text-sm" data-testid="filter-responsible" aria-label="Filtrar por responsável">
            <option value="">Todos os responsáveis</option>
            <option value="mine">Minhas pendências</option>
            <option value="unassigned">Sem responsável</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select value={filters.period} onChange={(e) => handleFilterChange('period', e.target.value)} className="nc-input text-sm" data-testid="filter-period" aria-label="Filtrar por período">
            <option value="">Todo o período</option>
            <option value="today">Hoje</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por classificação, status, tribunal, área ou id"
            className="nc-input text-sm"
            data-testid="triage-search"
            aria-label="Buscar movimentações"
          />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="nc-input text-sm" data-testid="triage-sort" aria-label="Ordenar por">
            <option value="priority">Prioridade (padrão)</option>
            <option value="movement_date">Data da movimentação</option>
            <option value="detected_at">Data de detecção</option>
          </select>
          <button onClick={clearFilters} className="nc-btn text-sm" data-testid="clear-filters">Limpar filtros</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4" data-testid="triage-list">
        {loading && movements.length === 0 && (
          <div className="text-center py-12 text-nc-text-secondary" data-testid="triage-loading">Carregando movimentações...</div>
        )}

        {!loading && error && (
          <div className="text-center py-12" data-testid="triage-error">
            <div className="text-red-700 bg-red-50 p-4 rounded inline-block mb-3">{error}</div>
            <button onClick={() => fetchMovements(1, false)} className="nc-btn text-sm">Tentar novamente</button>
          </div>
        )}

        {!loading && !error && visibleMovements.length === 0 && (
          <div className="text-center py-12 text-nc-text-secondary" data-testid="triage-empty">
            {Object.values(filters).some((v) => v) || search ? (
              <>
                <p className="mb-3">Nenhuma movimentação corresponde aos filtros aplicados</p>
                <button onClick={clearFilters} className="nc-btn text-sm" data-testid="clear-empty-filters">Limpar filtros</button>
              </>
            ) : (
              <p>Não há movimentações disponíveis para sua revisão.</p>
            )}
          </div>
        )}

        <div className="space-y-3">
          {visibleMovements.map((mov) => {
            const isHighlighted = highlightedId === mov.id;
            const isUnassigned = !mov.assigned_user_id;
            const assignedName = mov.assigned_user?.name || (isUnassigned ? 'Sem responsável' : 'Responsável atribuído');
            const statusClass = STATUS_STYLES[mov.triage_status] || 'bg-gray-50 text-gray-700 border-gray-200';
            const priorityClass = PRIORITY_STYLES[mov.priority || 'media'];
            const classificationLabel = CLASSIFICATION_LABELS[mov.legal_classification] || '';
            const isSuggestion = mov.triage_status === 'novo' && mov.legal_classification && mov.legal_classification !== 'ainda_nao_classificada';
            return (
              <div
                key={mov.id}
                id={`triage-card-${mov.id}`}
                ref={isHighlighted ? highlightedRef : null}
                tabIndex={isHighlighted ? -1 : undefined}
                data-testid="triage-card"
                data-movement-id={mov.id}
                onClick={() => openDetail(mov)}
                className={cx(
                  'bg-nc-white border rounded-lg p-4 cursor-pointer transition hover:shadow-md',
                  isHighlighted ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50' : 'border-nc-gray-200'
                )}
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2" data-testid="triage-badges">
                      <span className={cx('text-xs font-semibold px-2 py-1 rounded border', statusClass)}>{TRIAGE_STATUS_LABELS[mov.triage_status] || mov.triage_status}</span>
                      <span className={cx('text-xs font-medium px-2 py-1 rounded border', priorityClass)}>{PRIORITY_LABELS[mov.priority] || 'Média'}</span>
                      {classificationLabel && (
                        <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-100">
                          {isSuggestion ? `Sugestão: ${classificationLabel}` : classificationLabel}
                        </span>
                      )}
                      {mov.triage_status === 'novo' && <span className="sr-only" data-testid="new-indicator">Movimentação nova</span>}
                    </div>
                    <div className="text-sm font-medium text-nc-text-title mb-1" data-testid="triage-case-title">{mov.case_process?.case?.title || 'Sem título'}</div>
                    <div className="text-xs text-nc-text-secondary mb-1" data-testid="triage-court">Tribunal: {mov.case_process?.court_name || '-'}</div>
                    <div className="text-xs text-nc-text-secondary mb-1" data-testid="triage-legal-area">{mov.case_process?.case?.legal_area || ''}</div>
                    <div className="text-xs text-nc-text-secondary mb-2" data-testid="triage-responsible">Responsável: {assignedName}</div>
                    <div className="text-sm text-nc-text-secondary" data-testid="triage-safe-summary">{mov.movement_summary || 'Movimentação processual'}</div>
                  </div>
                  <div className="text-right text-xs text-nc-text-secondary whitespace-nowrap min-w-[100px]">
                    <div data-testid="triage-movement-date">Mov: {formatDate(mov.movement_date)}</div>
                    <div className="mt-1" data-testid="triage-detected-at">Detectada: {formatDate(mov.detected_at)}</div>
                  </div>
                </div>

                {canAct && (
                  <div className="flex flex-wrap gap-2 mt-4" onClick={(e) => e.stopPropagation()} data-testid="triage-card-actions">
                    <button onClick={() => handleActionClick('assume', mov)} className="nc-btn text-xs" data-testid="action-assume">{ACTION_LABELS.assume}</button>
                    <button onClick={() => handleActionClick('assign', mov)} className="nc-btn text-xs" data-testid="action-assign">{ACTION_LABELS.assign}</button>
                    {mov.triage_status === 'novo' && (
                      <button onClick={() => handleActionClick('analyze', mov)} className="nc-btn text-xs" data-testid="action-analyze">{ACTION_LABELS.analyze}</button>
                    )}
                    {(mov.triage_status === 'novo' || mov.triage_status === 'em_analise') && (
                      <>
                        <button onClick={() => handleActionClick('review', mov)} className="nc-btn text-xs" data-testid="action-review">{ACTION_LABELS.review}</button>
                        <button onClick={() => handleActionClick('ignore', mov)} className="nc-btn text-xs" data-testid="action-ignore">{ACTION_LABELS.ignore}</button>
                        <button onClick={() => handleActionClick('note', mov)} className="nc-btn text-xs" data-testid="action-note">{ACTION_LABELS.note}</button>
                        <button onClick={() => handleActionClick('event', mov)} className="nc-btn text-xs" data-testid="action-event">{ACTION_LABELS.event}</button>
                      </>
                    )}
                    {mov.case_process?.case?.id && (
                      <button
                        onClick={() => router.push(buildInternalUrl({ tab: 'cases', caseId: mov.case_process.case.id }))}
                        className="nc-btn text-xs"
                        data-testid="action-open-case"
                      >
                        {ACTION_LABELS.openCase}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {partialError && (
          <div className="py-4 text-center" data-testid="triage-partial-error">
            <span className="text-red-600 text-sm mr-2">{partialError}</span>
            <button onClick={() => fetchMovements(page, false)} className="nc-btn text-xs">Tentar novamente</button>
          </div>
        )}

        {!loading && !error && page < totalPages && (
          <div className="py-4 text-center">
            <button onClick={() => fetchMovements(page + 1, true)} disabled={loadingMore} className="nc-btn text-sm" data-testid="load-more">
              {loadingMore ? 'Carregando...' : 'Carregar mais'}
            </button>
          </div>
        )}
      </div>

      {showDetail && selectedMovement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeDetail} role="dialog" aria-modal="true" aria-label="Detalhes da movimentação" data-testid="triage-detail-modal">
          <div className="bg-nc-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-nc-white border-b border-nc-gray-200 p-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-nc-text-title">Detalhes da Movimentação</h2>
              <button onClick={closeDetail} className="text-nc-text-secondary hover:text-nc-text" aria-label="Fechar" data-testid="close-detail">✕</button>
            </div>
            <div className="p-4 space-y-4">
              {message && (
                <div className={cx('p-3 rounded text-sm', message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')} data-testid="detail-message">{message.text}</div>
              )}
              <div className="bg-nc-gray-50 p-4 rounded">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-nc-text-secondary">Tribunal:</span><div className="font-medium" data-testid="detail-court">{selectedMovement.case_process?.court_name || '-'}</div></div>
                  <div><span className="text-nc-text-secondary">Área jurídica:</span><div className="font-medium" data-testid="detail-area">{selectedMovement.case_process?.case?.legal_area || '-'}</div></div>
                  <div><span className="text-nc-text-secondary">Data da movimentação:</span><div className="font-medium" data-testid="detail-movement-date">{formatDate(selectedMovement.movement_date)}</div></div>
                  <div><span className="text-nc-text-secondary">Detectada em:</span><div className="font-medium" data-testid="detail-detected-at">{formatDateTime(selectedMovement.detected_at)}</div></div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                {canAct && (
                  <>
                    <button onClick={() => handleActionClick('assume', selectedMovement)} className="nc-btn text-sm">{ACTION_LABELS.assume}</button>
                    <button onClick={() => handleActionClick('assign', selectedMovement)} className="nc-btn text-sm">{ACTION_LABELS.assign}</button>
                    {selectedMovement.triage_status === 'novo' && <button onClick={() => handleActionClick('analyze', selectedMovement)} className="nc-btn text-sm">{ACTION_LABELS.analyze}</button>}
                    {(selectedMovement.triage_status === 'novo' || selectedMovement.triage_status === 'em_analise') && (
                      <>
                        <button onClick={() => handleActionClick('review', selectedMovement)} className="nc-btn text-sm">{ACTION_LABELS.review}</button>
                        <button onClick={() => handleActionClick('ignore', selectedMovement)} className="nc-btn text-sm">{ACTION_LABELS.ignore}</button>
                        <button onClick={() => handleActionClick('note', selectedMovement)} className="nc-btn text-sm">{ACTION_LABELS.note}</button>
                        <button onClick={() => handleActionClick('event', selectedMovement)} className="nc-btn text-sm">{ACTION_LABELS.event}</button>
                      </>
                    )}
                    <button onClick={getSuggestion} className="nc-btn text-sm" data-testid="btn-suggestion">✨ Obter sugestão</button>
                  </>
                )}
              </div>

              {suggestion && (
                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-sm" data-testid="suggestion-box">
                  <div className="font-semibold text-yellow-800 mb-1">⚠️ {suggestion.disclaimer}</div>
                  <div className="text-yellow-700">Classificação sugerida: <strong>{CLASSIFICATION_LABELS[suggestion.suggested_classification]}</strong> | Prioridade sugerida: <strong>{PRIORITY_LABELS[suggestion.suggested_priority]}</strong></div>
                </div>
              )}

              <div className="bg-nc-gray-50 p-4 rounded">
                <h3 className="font-semibold text-nc-text-title mb-3">Histórico de triagem</h3>
                {history.length === 0 ? (
                  <p className="text-sm text-nc-text-secondary" data-testid="history-empty">Ainda não há ações registradas para esta movimentação.</p>
                ) : (
                  <div className="space-y-2">
                    {history.map((h) => (
                      <div key={h.id} className="bg-nc-white p-3 rounded text-sm" data-testid="history-item">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-nc-text">{h.user?.name || 'Sistema'}</span>
                          <span className="text-xs text-nc-text-secondary">{formatDateTime(h.created_at)}</span>
                        </div>
                        <div className="text-nc-text-secondary">
                          {h.action === 'update_triage' && `Atualizou triagem`}
                          {h.action === 'create_note' && `Criou nota interna`}
                          {h.action === 'create_reminder' && `Criou lembrete`}
                          {h.action === 'create_event' && `Criou evento de agenda`}
                          {h.action === 'assign_user' && `Atribuiu responsável`}
                        </div>
                        {h.old_status && h.new_status && (
                          <div className="text-xs text-nc-text-secondary mt-1">
                            Status: {TRIAGE_STATUS_LABELS[h.old_status] || h.old_status} → {TRIAGE_STATUS_LABELS[h.new_status] || h.new_status}
                          </div>
                        )}
                        {h.old_priority && h.new_priority && h.old_priority !== h.new_priority && (
                          <div className="text-xs text-nc-text-secondary mt-1">
                            Prioridade: {PRIORITY_LABELS[h.old_priority] || h.old_priority} → {PRIORITY_LABELS[h.new_priority] || h.new_priority}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {renderActionModal()}
    </div>
  );
}
