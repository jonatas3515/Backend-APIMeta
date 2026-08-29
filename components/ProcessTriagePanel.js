import { useState, useEffect } from 'react';
import { getAuthHeaders } from '../lib/api';

const TRIAGE_STATUS_LABELS = {
  novo: 'Nova',
  em_analise: 'Em Análise',
  revisado: 'Revisada',
  ignorado: 'Ignorada',
  convertido_em_nota: 'Nota Criada',
  convertido_em_lembrete: 'Lembrete Criado',
  convertido_em_agenda: 'Agenda Criada'
};

const CLASSIFICATION_LABELS = {
  ainda_nao_classificada: 'Não Classificada',
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

const PRIORITY_LABELS = {
  baixa: '🟢 Baixa',
  media: '🟡 Média',
  alta: '🔴 Alta',
  urgente: '⚠️ Urgente'
};

export default function ProcessTriagePanel({ movementId }) {
  const [movements, setMovements] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [history, setHistory] = useState([]);
  
  // Filtros
  const [filters, setFilters] = useState({
    triage_status: '',
    legal_classification: '',
    priority: '',
    legal_area: '',
    page: 1,
    limit: 20
  });

  // Formulários
  const [noteForm, setNoteForm] = useState({ text: '', is_visible_to_client: false });
  const [reminderForm, setReminderForm] = useState({ title: '', message: '', scheduled_for: '', reminder_type: 'prazo_judicial', priority: 'media' });
  const [eventForm, setEventForm] = useState({ event_date: '', event_time: '', event_type: 'audiencia', description: '', priority: 'media', location: '' });
  const [triageForm, setTriageForm] = useState({ triage_status: '', legal_classification: '', priority: '', triage_notes: '' });
  
  const [activeForm, setActiveForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [suggestion, setSuggestion] = useState(null);

  useEffect(() => {
    fetchMovements();
    fetchStats();
  }, [filters]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!movementId || movements.length === 0) return;
    const found = movements.find((m) => m.id === movementId);
    if (found) {
      openMovement(found);
    } else {
      setMessage({ type: 'warning', text: 'Movimentação não encontrada ou não disponível.' });
    }
  }, [movementId, movements]);

  const fetchMovements = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      params.append('action', 'list');
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });

      const res = await fetch(`/api/triage?${params}`, { headers });
      const data = await res.json();
      
      if (res.ok) {
        setMovements(data.movements || []);
      } else {
        setMessage({ type: 'error', text: data.error || 'Erro ao carregar movimentações' });
      }
    } catch (error) {
      console.error('[TRIAGE] Erro ao carregar:', error);
      setMessage({ type: 'error', text: 'Erro ao carregar movimentações' });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/triage?action=stats', { headers });
      const data = await res.json();
      
      if (res.ok) {
        setStats(data);
      }
    } catch (error) {
      console.error('[TRIAGE] Erro ao carregar estatísticas:', error);
    }
  };

  const openMovement = async (movement) => {
    setSelectedMovement(movement);
    setShowModal(true);
    setActiveForm(null);
    setMessage(null);
    setSuggestion(null);

    // Buscar detalhes e histórico
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/triage?id=${movement.id}`, { headers });
      const data = await res.json();
      
      if (res.ok) {
        setSelectedMovement(data.movement);
        setHistory(data.history || []);
        
        // Preencher formulário de triagem
        setTriageForm({
          triage_status: data.movement.triage_status || '',
          legal_classification: data.movement.legal_classification || '',
          priority: data.movement.priority || '',
          triage_notes: data.movement.triage_notes || ''
        });
      }
    } catch (error) {
      console.error('[TRIAGE] Erro ao carregar detalhes:', error);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedMovement(null);
    setHistory([]);
    setActiveForm(null);
    setMessage(null);
    setSuggestion(null);
  };

  const updateTriage = async () => {
    if (!selectedMovement) return;
    
    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/triage?id=${selectedMovement.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(triageForm)
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Triagem atualizada com sucesso' });
        fetchMovements();
        setTimeout(() => closeModal(), 1500);
      } else {
        setMessage({ type: 'error', text: data.error || 'Erro ao atualizar triagem' });
      }
    } catch (error) {
      console.error('[TRIAGE] Erro ao atualizar:', error);
      setMessage({ type: 'error', text: 'Erro ao atualizar triagem' });
    } finally {
      setSubmitting(false);
    }
  };

  const createNote = async () => {
    if (!selectedMovement || !noteForm.text) return;
    
    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/triage?action=create_note', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          movement_id: selectedMovement.id,
          ...noteForm
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Nota criada com sucesso' });
        fetchMovements();
        setTimeout(() => closeModal(), 1500);
      } else {
        setMessage({ type: 'error', text: data.error || 'Erro ao criar nota' });
      }
    } catch (error) {
      console.error('[TRIAGE] Erro ao criar nota:', error);
      setMessage({ type: 'error', text: 'Erro ao criar nota' });
    } finally {
      setSubmitting(false);
    }
  };

  const createReminder = async () => {
    if (!selectedMovement || !reminderForm.title || !reminderForm.scheduled_for) return;
    
    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/triage?action=create_reminder', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          movement_id: selectedMovement.id,
          ...reminderForm
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Lembrete criado com sucesso' });
        fetchMovements();
        setTimeout(() => closeModal(), 1500);
      } else {
        setMessage({ type: 'error', text: data.error || 'Erro ao criar lembrete' });
      }
    } catch (error) {
      console.error('[TRIAGE] Erro ao criar lembrete:', error);
      setMessage({ type: 'error', text: 'Erro ao criar lembrete' });
    } finally {
      setSubmitting(false);
    }
  };

  const createEvent = async () => {
    if (!selectedMovement || !eventForm.event_date || !eventForm.event_type) return;
    
    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/triage?action=create_event', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          movement_id: selectedMovement.id,
          ...eventForm
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Evento criado com sucesso' });
        fetchMovements();
        setTimeout(() => closeModal(), 1500);
      } else {
        setMessage({ type: 'error', text: data.error || 'Erro ao criar evento' });
      }
    } catch (error) {
      console.error('[TRIAGE] Erro ao criar evento:', error);
      setMessage({ type: 'error', text: 'Erro ao criar evento' });
    } finally {
      setSubmitting(false);
    }
  };

  const getSuggestion = async () => {
    if (!selectedMovement) return;
    
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/triage?action=suggest', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          movement_text: selectedMovement.movement_text
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setSuggestion(data);
        setTriageForm(prev => ({
          ...prev,
          legal_classification: data.suggested_classification,
          priority: data.suggested_priority
        }));
      }
    } catch (error) {
      console.error('[TRIAGE] Erro ao obter sugestão:', error);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR');
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('pt-BR');
  };

  return (
    <div className="flex-1 flex flex-col bg-nc-gray-50 overflow-hidden">
      {/* Header */}
      <div className="bg-nc-white border-b border-nc-gray-200 p-4">
        <h1 className="text-2xl font-bold text-nc-text-title">⏱️ Central de Triagem Processual</h1>
        <p className="text-sm text-nc-text-secondary mt-1">
          Revisão humana de movimentações processuais
        </p>
      </div>

      {/* Estatísticas */}
      {stats && (
        <div className="bg-nc-white border-b border-nc-gray-200 p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-nc-gray-50 p-3 rounded">
              <div className="text-xs text-nc-text-secondary">Total</div>
              <div className="text-2xl font-bold text-nc-text-title">{stats.total || 0}</div>
            </div>
            <div className="bg-yellow-50 p-3 rounded">
              <div className="text-xs text-nc-text-secondary">Novas</div>
              <div className="text-2xl font-bold text-yellow-700">{stats.by_status?.novo || 0}</div>
            </div>
            <div className="bg-blue-50 p-3 rounded">
              <div className="text-xs text-nc-text-secondary">Em Análise</div>
              <div className="text-2xl font-bold text-blue-700">{stats.by_status?.em_analise || 0}</div>
            </div>
            <div className="bg-red-50 p-3 rounded">
              <div className="text-xs text-nc-text-secondary">Alta/Urgente</div>
              <div className="text-2xl font-bold text-red-700">
                {(stats.by_priority?.alta || 0) + (stats.by_priority?.urgente || 0)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-nc-white border-b border-nc-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={filters.triage_status}
            onChange={(e) => setFilters(prev => ({ ...prev, triage_status: e.target.value, page: 1 }))}
            className="nc-input text-sm"
          >
            <option value="">Todos os Status</option>
            {Object.entries(TRIAGE_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <select
            value={filters.priority}
            onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value, page: 1 }))}
            className="nc-input text-sm"
          >
            <option value="">Todas as Prioridades</option>
            {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <select
            value={filters.legal_classification}
            onChange={(e) => setFilters(prev => ({ ...prev, legal_classification: e.target.value, page: 1 }))}
            className="nc-input text-sm"
          >
            <option value="">Todas as Classificações</option>
            {Object.entries(CLASSIFICATION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <button
            onClick={() => setFilters({ triage_status: '', legal_classification: '', priority: '', legal_area: '', page: 1, limit: 20 })}
            className="nc-btn text-sm"
          >
            Limpar Filtros
          </button>
        </div>
      </div>

      {/* Lista de Movimentações */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center py-8 text-nc-text-secondary">Carregando...</div>
        ) : movements.length === 0 ? (
          <div className="text-center py-8 text-nc-text-secondary">Nenhuma movimentação encontrada</div>
        ) : (
          <div className="space-y-3">
            {movements.map((mov) => (
              <div
                key={mov.id}
                onClick={() => openMovement(mov)}
                className="bg-nc-white border border-nc-gray-200 rounded-lg p-4 hover:shadow-md transition cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold px-2 py-1 rounded bg-nc-gray-100 text-nc-text">
                        {TRIAGE_STATUS_LABELS[mov.triage_status] || mov.triage_status}
                      </span>
                      <span className="text-xs px-2 py-1 rounded bg-nc-yellow-50 text-nc-text">
                        {PRIORITY_LABELS[mov.priority] || mov.priority}
                      </span>
                      {mov.legal_classification && mov.legal_classification !== 'ainda_nao_classificada' && (
                        <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700">
                          {CLASSIFICATION_LABELS[mov.legal_classification]}
                        </span>
                      )}
                    </div>
                    
                    <div className="text-sm font-medium text-nc-text-title mb-1">
                      {mov.case_process?.case?.title || 'Sem título'}
                    </div>
                    
                    <div className="text-xs text-nc-text-secondary mb-2">
                      Processo: {mov.case_process?.process_number || '-'} | 
                      Tribunal: {mov.case_process?.court_name || '-'}
                    </div>
                    
                    <div className="text-sm text-nc-text line-clamp-2">
                      {mov.movement_text}
                    </div>
                  </div>
                  
                  <div className="text-right text-xs text-nc-text-secondary whitespace-nowrap">
                    <div>{formatDate(mov.movement_date)}</div>
                    <div className="mt-1">Detectada: {formatDate(mov.detected_at)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Detalhes */}
      {showModal && selectedMovement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-nc-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="sticky top-0 bg-nc-white border-b border-nc-gray-200 p-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-nc-text-title">Detalhes da Movimentação</h2>
              <button onClick={closeModal} className="text-nc-text-secondary hover:text-nc-text">✕</button>
            </div>

            {/* Modal Content */}
            <div className="p-4 space-y-4">
              {/* Mensagens */}
              {message && (
                <div className={`p-3 rounded ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {message.text}
                </div>
              )}

              {/* Informações Básicas */}
              <div className="bg-nc-gray-50 p-4 rounded">
                <h3 className="font-semibold text-nc-text-title mb-2">Informações</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-nc-text-secondary">Processo:</span>
                    <div className="font-medium">{selectedMovement.case_process?.process_number || '-'}</div>
                  </div>
                  <div>
                    <span className="text-nc-text-secondary">Tribunal:</span>
                    <div className="font-medium">{selectedMovement.case_process?.court_name || '-'}</div>
                  </div>
                  <div>
                    <span className="text-nc-text-secondary">Data da Movimentação:</span>
                    <div className="font-medium">{formatDate(selectedMovement.movement_date)}</div>
                  </div>
                  <div>
                    <span className="text-nc-text-secondary">Detectada em:</span>
                    <div className="font-medium">{formatDateTime(selectedMovement.detected_at)}</div>
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-nc-text-secondary text-sm">Texto da Movimentação:</span>
                  <div className="mt-1 p-3 bg-nc-white rounded text-sm">{selectedMovement.movement_text}</div>
                </div>
              </div>

              {/* Ações */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveForm('triage')}
                  className={`nc-btn text-sm ${activeForm === 'triage' ? 'nc-btn-active' : ''}`}
                >
                  ✏️ Atualizar Triagem
                </button>
                <button
                  onClick={() => setActiveForm('note')}
                  className={`nc-btn text-sm ${activeForm === 'note' ? 'nc-btn-active' : ''}`}
                  disabled={selectedMovement.triage_status !== 'novo' && selectedMovement.triage_status !== 'em_analise'}
                >
                  📝 Criar Nota
                </button>
                <button
                  onClick={() => setActiveForm('reminder')}
                  className={`nc-btn text-sm ${activeForm === 'reminder' ? 'nc-btn-active' : ''}`}
                  disabled={selectedMovement.triage_status !== 'novo' && selectedMovement.triage_status !== 'em_analise'}
                >
                  🔔 Criar Lembrete
                </button>
                <button
                  onClick={() => setActiveForm('event')}
                  className={`nc-btn text-sm ${activeForm === 'event' ? 'nc-btn-active' : ''}`}
                  disabled={selectedMovement.triage_status !== 'novo' && selectedMovement.triage_status !== 'em_analise'}
                >
                  📅 Criar Evento
                </button>
                <button
                  onClick={getSuggestion}
                  className="nc-btn text-sm"
                >
                  ✨ Obter Sugestão
                </button>
              </div>

              {/* Sugestão Automática */}
              {suggestion && (
                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
                  <div className="text-sm font-semibold text-yellow-800 mb-2">
                    ⚠️ {suggestion.disclaimer}
                  </div>
                  <div className="text-sm text-yellow-700">
                    Classificação sugerida: <strong>{CLASSIFICATION_LABELS[suggestion.suggested_classification]}</strong> | 
                    Prioridade sugerida: <strong>{PRIORITY_LABELS[suggestion.suggested_priority]}</strong>
                  </div>
                </div>
              )}

              {/* Formulário de Triagem */}
              {activeForm === 'triage' && (
                <div className="bg-nc-gray-50 p-4 rounded space-y-3">
                  <h3 className="font-semibold text-nc-text-title">Atualizar Triagem</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-nc-text mb-1">Status</label>
                    <select
                      value={triageForm.triage_status}
                      onChange={(e) => setTriageForm(prev => ({ ...prev, triage_status: e.target.value }))}
                      className="nc-input"
                    >
                      <option value="">Selecione...</option>
                      {Object.entries(TRIAGE_STATUS_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-nc-text mb-1">Classificação</label>
                    <select
                      value={triageForm.legal_classification}
                      onChange={(e) => setTriageForm(prev => ({ ...prev, legal_classification: e.target.value }))}
                      className="nc-input"
                    >
                      <option value="">Selecione...</option>
                      {Object.entries(CLASSIFICATION_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-nc-text mb-1">Prioridade</label>
                    <select
                      value={triageForm.priority}
                      onChange={(e) => setTriageForm(prev => ({ ...prev, priority: e.target.value }))}
                      className="nc-input"
                    >
                      <option value="">Selecione...</option>
                      {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-nc-text mb-1">Observações</label>
                    <textarea
                      value={triageForm.triage_notes}
                      onChange={(e) => setTriageForm(prev => ({ ...prev, triage_notes: e.target.value }))}
                      className="nc-input resize-none"
                      rows="3"
                      placeholder="Observações sobre a triagem..."
                    />
                  </div>

                  <button
                    onClick={updateTriage}
                    disabled={submitting}
                    className="nc-btn-primary w-full disabled:opacity-50"
                  >
                    {submitting ? 'Salvando...' : 'Salvar Triagem'}
                  </button>
                </div>
              )}

              {/* Formulário de Nota */}
              {activeForm === 'note' && (
                <div className="bg-nc-gray-50 p-4 rounded space-y-3">
                  <h3 className="font-semibold text-nc-text-title">Criar Nota Interna</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-nc-text mb-1">Texto da Nota</label>
                    <textarea
                      value={noteForm.text}
                      onChange={(e) => setNoteForm(prev => ({ ...prev, text: e.target.value }))}
                      className="nc-input resize-none"
                      rows="4"
                      placeholder="Digite a nota..."
                      required
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="visible-to-client"
                      checked={noteForm.is_visible_to_client}
                      onChange={(e) => setNoteForm(prev => ({ ...prev, is_visible_to_client: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <label htmlFor="visible-to-client" className="text-sm text-nc-text">
                      Visível ao cliente
                    </label>
                  </div>

                  <button
                    onClick={createNote}
                    disabled={submitting || !noteForm.text}
                    className="nc-btn-primary w-full disabled:opacity-50"
                  >
                    {submitting ? 'Criando...' : 'Criar Nota'}
                  </button>
                </div>
              )}

              {/* Formulário de Lembrete */}
              {activeForm === 'reminder' && (
                <div className="bg-nc-gray-50 p-4 rounded space-y-3">
                  <h3 className="font-semibold text-nc-text-title">Criar Lembrete</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-nc-text mb-1">Título *</label>
                    <input
                      type="text"
                      value={reminderForm.title}
                      onChange={(e) => setReminderForm(prev => ({ ...prev, title: e.target.value }))}
                      className="nc-input"
                      placeholder="Ex: Prazo para recurso"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-nc-text mb-1">Mensagem</label>
                    <textarea
                      value={reminderForm.message}
                      onChange={(e) => setReminderForm(prev => ({ ...prev, message: e.target.value }))}
                      className="nc-input resize-none"
                      rows="3"
                      placeholder="Detalhes do lembrete..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-nc-text mb-1">Data/Hora *</label>
                      <input
                        type="datetime-local"
                        value={reminderForm.scheduled_for}
                        onChange={(e) => setReminderForm(prev => ({ ...prev, scheduled_for: e.target.value }))}
                        className="nc-input"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-nc-text mb-1">Tipo</label>
                      <select
                        value={reminderForm.reminder_type}
                        onChange={(e) => setReminderForm(prev => ({ ...prev, reminder_type: e.target.value }))}
                        className="nc-input"
                      >
                        <option value="prazo_judicial">Prazo Judicial</option>
                        <option value="lembrete_cliente">Lembrete Cliente</option>
                        <option value="prazo_interno">Prazo Interno</option>
                        <option value="reuniao">Reunião</option>
                        <option value="audiencia">Audiência</option>
                        <option value="outro">Outro</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-nc-text mb-1">Prioridade</label>
                    <select
                      value={reminderForm.priority}
                      onChange={(e) => setReminderForm(prev => ({ ...prev, priority: e.target.value }))}
                      className="nc-input"
                    >
                      <option value="baixa">Baixa</option>
                      <option value="media">Média</option>
                      <option value="alta">Alta</option>
                    </select>
                  </div>

                  <button
                    onClick={createReminder}
                    disabled={submitting || !reminderForm.title || !reminderForm.scheduled_for}
                    className="nc-btn-primary w-full disabled:opacity-50"
                  >
                    {submitting ? 'Criando...' : 'Criar Lembrete'}
                  </button>
                </div>
              )}

              {/* Formulário de Evento */}
              {activeForm === 'event' && (
                <div className="bg-nc-gray-50 p-4 rounded space-y-3">
                  <h3 className="font-semibold text-nc-text-title">Criar Evento de Agenda</h3>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-nc-text mb-1">Data *</label>
                      <input
                        type="date"
                        value={eventForm.event_date}
                        onChange={(e) => setEventForm(prev => ({ ...prev, event_date: e.target.value }))}
                        className="nc-input"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-nc-text mb-1">Hora</label>
                      <input
                        type="time"
                        value={eventForm.event_time}
                        onChange={(e) => setEventForm(prev => ({ ...prev, event_time: e.target.value }))}
                        className="nc-input"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-nc-text mb-1">Tipo *</label>
                    <select
                      value={eventForm.event_type}
                      onChange={(e) => setEventForm(prev => ({ ...prev, event_type: e.target.value }))}
                      className="nc-input"
                      required
                    >
                      <option value="audiencia">Audiência</option>
                      <option value="prazo_judicial">Prazo Judicial</option>
                      <option value="reuniao">Reunião</option>
                      <option value="pericia">Perícia</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-nc-text mb-1">Descrição</label>
                    <textarea
                      value={eventForm.description}
                      onChange={(e) => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                      className="nc-input resize-none"
                      rows="3"
                      placeholder="Detalhes do evento..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-nc-text mb-1">Prioridade</label>
                      <select
                        value={eventForm.priority}
                        onChange={(e) => setEventForm(prev => ({ ...prev, priority: e.target.value }))}
                        className="nc-input"
                      >
                        <option value="baixa">Baixa</option>
                        <option value="media">Média</option>
                        <option value="alta">Alta</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-nc-text mb-1">Local</label>
                      <input
                        type="text"
                        value={eventForm.location}
                        onChange={(e) => setEventForm(prev => ({ ...prev, location: e.target.value }))}
                        className="nc-input"
                        placeholder="Ex: Fórum Central"
                      />
                    </div>
                  </div>

                  <button
                    onClick={createEvent}
                    disabled={submitting || !eventForm.event_date || !eventForm.event_type}
                    className="nc-btn-primary w-full disabled:opacity-50"
                  >
                    {submitting ? 'Criando...' : 'Criar Evento'}
                  </button>
                </div>
              )}

              {/* Histórico */}
              {history.length > 0 && (
                <div className="bg-nc-gray-50 p-4 rounded">
                  <h3 className="font-semibold text-nc-text-title mb-3">Histórico de Triagem</h3>
                  <div className="space-y-2">
                    {history.map((h) => (
                      <div key={h.id} className="bg-nc-white p-3 rounded text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-nc-text">{h.user?.name || 'Sistema'}</span>
                          <span className="text-xs text-nc-text-secondary">{formatDateTime(h.created_at)}</span>
                        </div>
                        <div className="text-nc-text-secondary">
                          {h.action === 'update_triage' && 'Atualizou triagem'}
                          {h.action === 'create_note' && 'Criou nota interna'}
                          {h.action === 'create_reminder' && 'Criou lembrete'}
                          {h.action === 'create_event' && 'Criou evento de agenda'}
                        </div>
                        {h.notes && <div className="text-xs text-nc-text-secondary mt-1">{h.notes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
