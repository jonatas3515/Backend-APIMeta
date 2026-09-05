import { useEffect, useMemo, useState } from 'react';
import { apiCall } from '../lib/apiClient';
import { formatPhone } from '../lib/formatters';
import axios from 'axios';

const LEGAL_AREA_ICONS = {
  'Direito Trabalhista': '⚖️',
  'Trabalhista': '⚖️',
  'Direito Previdenciário': '👴',
  'Previdenciário': '👴',
  'Direito Civil': '🏠',
  'Civil': '🏠',
  'Direito do Consumidor': '🛒',
  'Consumidor': '🛒',
  'Direito Administrativo': '🏛️',
  'Administrativo': '🏛️'
};

const PRIORITY_COLORS = {
  alta: 'bg-red-100 text-red-800 border-red-200',
  media: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  baixa: 'bg-green-100 text-green-800 border-green-200'
};

const STATUS_BADGES = {
  open: { text: 'Conversa Ativa', class: 'bg-green-100 text-green-800 border-green-200' },
  closed: { text: 'Conversa Encerrada', class: 'bg-gray-100 text-gray-800 border-gray-200' },
  lead: { text: 'Lead', class: 'bg-blue-100 text-blue-800 border-blue-200' },
  client: { text: 'Cliente Ativo', class: 'bg-green-100 text-green-800 border-green-200' },
  prospect: { text: 'Prospect', class: 'bg-blue-100 text-blue-800 border-blue-200' }
};

const getConsentStatus = (consents) => {
  if (!consents || consents.length === 0) return { text: 'Pendente', class: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
  const latest = consents[0];
  if (latest.value) return { text: 'Ativo', class: 'bg-green-100 text-green-800 border-green-200' };
  return { text: 'Revogado', class: 'bg-red-100 text-red-800 border-red-200' };
};

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function shortDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

export default function CustomerProfilePanel({ conversation, isOpen, onClose, onConversationUpdate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [caseSearch, setCaseSearch] = useState('');
  const [caseStatusFilter, setCaseStatusFilter] = useState('todos');

  const [showNewCase, setShowNewCase] = useState(false);
  const [newCase, setNewCase] = useState({ title: '', legal_area: '', case_type: '', priority: 'media' });
  const [creatingCase, setCreatingCase] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editData, setEditData] = useState({ client_name: '', municipality: '', state: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [requestingConsent, setRequestingConsent] = useState(false);

  const conversationId = conversation?.id;

  const fetchProfile = async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/customer-profile?conversation_id=${conversationId}`, { headers });
      if (!response.ok) throw new Error('Erro ao carregar perfil');
      const result = await response.json();
      setData(result);
      setEditData({
        client_name: result.customer?.name || '',
        municipality: result.customer?.municipality || '',
        state: result.customer?.state || ''
      });
    } catch (err) {
      console.error('[CUSTOMER-PROFILE] Erro:', err);
      setError('Não foi possível carregar o perfil do cliente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchProfile();
    } else {
      setData(null);
    }
  }, [isOpen, conversationId]);

  const allCases = useMemo(() => {
    if (!data) return [];
    const list = [...data.active_cases, ...data.closed_cases];
    if (caseStatusFilter === 'ativos') return data.active_cases;
    if (caseStatusFilter === 'encerrados') return data.closed_cases;
    return list;
  }, [data, caseStatusFilter]);

  const filteredCases = useMemo(() => {
    if (!caseSearch) return allCases;
    const term = caseSearch.toLowerCase();
    return allCases.filter(c =>
      (c.title?.toLowerCase().includes(term)) ||
      (c.legal_area?.toLowerCase().includes(term)) ||
      (c.case_type?.toLowerCase().includes(term))
    );
  }, [allCases, caseSearch]);

  const handleCreateCase = async (e) => {
    e.preventDefault();
    if (!newCase.title) return;
    setCreatingCase(true);
    try {
      const headers = await getAuthHeaders();
      await axios.post('/api/cases', {
        conversation_id: conversationId,
        title: newCase.title,
        legal_area: newCase.legal_area || null,
        case_type: newCase.case_type || null,
        priority: newCase.priority || 'media'
      }, { headers });
      setNewCase({ title: '', legal_area: '', case_type: '', priority: 'media' });
      setShowNewCase(false);
      fetchProfile();
    } catch (err) {
      console.error('[CUSTOMER-PROFILE] Erro ao criar caso:', err);
      alert('Erro ao criar caso');
    } finally {
      setCreatingCase(false);
    }
  };

  const handleUpdateCustomer = async (e) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({
          client_name: editData.client_name,
          municipality: editData.municipality,
          state: editData.state
        })
        .eq('id', conversationId);

      if (error) throw error;
      setShowEdit(false);
      fetchProfile();
      if (onConversationUpdate) onConversationUpdate();
    } catch (err) {
      console.error('[CUSTOMER-PROFILE] Erro ao atualizar dados:', err);
      alert('Erro ao atualizar dados');
    } finally {
      setSavingEdit(false);
    }
  };


  if (!isOpen) return null;

  const customer = data?.customer || {};
  const statusBadge = STATUS_BADGES[customer.client_status] || STATUS_BADGES[customer.status] || { text: 'Conversa', class: 'bg-gray-100 text-gray-800 border-gray-200' };

  return (
    <>
      {/* Backdrop mobile */}
      <div
        className="fixed inset-0 bg-black/30 z-30 md:hidden"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-40 w-full md:w-[30%] min-w-[320px] bg-nc-white border-l border-nc-gray-200 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-nc-gray-200 bg-nc-surface">
          <div>
            <h2 className="text-lg font-bold text-nc-text-title">👤 Perfil do Cliente</h2>
            <p className="text-xs text-nc-text-secondary">Dados consolidados do atendimento</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-nc-gray-200 text-nc-text-secondary transition"
            title="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading && (
            <div className="flex flex-col items-center justify-center h-32 text-nc-text-muted">
              <span className="text-2xl animate-spin">⏳</span>
              <p className="text-sm mt-2">Carregando perfil...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">
              {error}
            </div>
          )}

          {data?.anonymized && (
            <div className="bg-gray-100 border border-gray-300 rounded p-3 text-sm text-gray-700">
              Cliente anonimizado. Dados pessoais não estão disponíveis.
            </div>
          )}

          {!loading && !error && data && !data.anonymized && (
            <>
              {/* Dados Básicos */}
              <section className="bg-nc-surface rounded-lg border border-nc-gray-200 p-4">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-sm text-nc-text-title">Dados Básicos</h3>
                  <span className={`text-xs px-2 py-1 rounded border ${statusBadge.class}`}>
                    {statusBadge.text}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <p><span className="text-nc-text-secondary">Nome:</span> <strong className="text-nc-text">{customer.name || 'Sem nome'}</strong></p>
                  <p><span className="text-nc-text-secondary">Telefone:</span> {formatPhone(customer.phone)}</p>
                  {customer.email && <p><span className="text-nc-text-secondary">Email:</span> {customer.email}</p>}
                  <p><span className="text-nc-text-secondary">Localização:</span> {customer.municipality || '-'}{customer.state ? `/${customer.state}` : ''}</p>
                  <p><span className="text-nc-text-secondary">Primeiro contato:</span> {shortDate(customer.first_contact_at)}</p>
                </div>
              </section>

              {/* Preferências de Comunicação */}
              <section className="bg-nc-surface rounded-lg border border-nc-gray-200 p-4">
                <h3 className="font-bold text-sm text-nc-text-title mb-3">📞 Preferências de Comunicação</h3>
                <div className="space-y-2 text-sm">
                  <p><span className="text-nc-text-secondary">Canal:</span> {customer.preferences?.preferred_channel || 'WhatsApp'}</p>
                  <p><span className="text-nc-text-secondary">Melhor horário:</span> {customer.preferences?.best_time || 'Não informado'}</p>
                  <p><span className="text-nc-text-secondary">Idioma:</span> {customer.preferences?.language || 'Português'}</p>
                </div>
              </section>

              {/* Consentimentos LGPD */}
              <section className="bg-nc-surface rounded-lg border border-nc-gray-200 p-4">
                <h3 className="font-bold text-sm text-nc-text-title mb-3">🛡️ Consentimentos LGPD</h3>
                <div className="text-xs text-nc-text-secondary space-y-2">
                  <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1.5">
                    ℹ️ O consentimento LGPD é informado automaticamente na primeira mensagem de boas-vindas. Ao continuar a conversa, o cliente concorda com os termos de tratamento de dados.
                  </p>
                </div>

                {customer.intake_data?.consent_accepted_at && (
                  <p className="mt-2 text-xs text-nc-text-secondary">
                    Aceito em: {formatDate(customer.intake_data.consent_accepted_at)}
                  </p>
                )}

                {customer.intake_data?.consent_protocol && (
                  <p className="mt-1 text-xs text-nc-text-secondary">
                    Protocolo: #{customer.intake_data.consent_protocol}
                  </p>
                )}
              </section>

              {/* Histórico de Casos */}
              <section className="bg-nc-surface rounded-lg border border-nc-gray-200 p-4">
                <h3 className="font-bold text-sm text-nc-text-title mb-3">📋 Histórico de Casos</h3>

                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={caseSearch}
                    onChange={(e) => setCaseSearch(e.target.value)}
                    placeholder="Buscar caso..."
                    className="nc-input text-xs flex-1"
                  />
                  <select
                    value={caseStatusFilter}
                    onChange={(e) => setCaseStatusFilter(e.target.value)}
                    className="nc-input text-xs"
                  >
                    <option value="todos">Todos</option>
                    <option value="ativos">Ativos</option>
                    <option value="encerrados">Encerrados</option>
                  </select>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredCases.length > 0 ? filteredCases.map(c => (
                    <div key={c.id} className="border border-nc-gray-200 rounded p-2 bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-nc-text truncate">{c.title}</p>
                          <p className="text-xs text-nc-text-secondary">
                            {LEGAL_AREA_ICONS[c.legal_area] || '📁'} {c.legal_area || 'Sem área'} • {c.case_type || 'Sem tipo'}
                          </p>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[c.priority] || PRIORITY_COLORS.media}`}>
                          {c.priority}
                        </span>
                      </div>
                      <p className="text-xs text-nc-text-secondary mt-1">Status: {c.status} {c.deadline_date && `• Prazo: ${shortDate(c.deadline_date)}`}</p>
                    </div>
                  )) : (
                    <p className="text-sm text-nc-text-muted">Nenhum caso encontrado.</p>
                  )}
                </div>
              </section>

              {/* Documentos Recebidos */}
              <section className="bg-nc-surface rounded-lg border border-nc-gray-200 p-4">
                <h3 className="font-bold text-sm text-nc-text-title mb-3">📄 Documentos Recebidos</h3>
                {data.documents && data.documents.length > 0 ? (
                  <ul className="space-y-2 text-sm max-h-48 overflow-y-auto">
                    {data.documents.map(d => (
                      <li key={d.id} className="flex items-center justify-between border-b border-nc-gray-200 pb-2 last:border-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="font-medium text-nc-text truncate">{d.document_name}</p>
                          <p className="text-xs text-nc-text-secondary">{shortDate(d.received_at)}</p>
                        </div>
                        {d.media_url ? (
                          <a
                            href={d.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-nc-yellow hover:underline text-xs"
                          >
                            Visualizar
                          </a>
                        ) : (
                          <span className="text-xs text-nc-text-muted">Recebido</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-nc-text-muted">Nenhum documento recebido.</p>
                )}
              </section>

              {/* Últimas Interações */}
              <section className="bg-nc-surface rounded-lg border border-nc-gray-200 p-4">
                <h3 className="font-bold text-sm text-nc-text-title mb-3">💬 Últimas Interações</h3>
                {data.recent_messages && data.recent_messages.length > 0 ? (
                  <div className="space-y-2 text-sm">
                    {data.recent_messages.map(msg => (
                      <div key={msg.id} className="flex gap-2">
                        <span className="text-nc-text-secondary text-xs whitespace-nowrap pt-0.5">
                          {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-nc-text-secondary">
                            {msg.direction === 'inbound' ? '⬅️ Recebida' : '➡️ Enviada'} {msg.sender_type === 'bot' && '(bot)'}
                          </p>
                          <p className="text-nc-text truncate">
                            {msg.content_type === 'text' ? (msg.text || 'Mensagem de texto') : `📎 ${msg.content_type}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-nc-text-muted">Nenhuma interação recente.</p>
                )}
              </section>
            </>
          )}
        </div>

        {/* Ações Rápidas */}
        <div className="border-t border-nc-gray-200 p-4 bg-nc-surface space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setShowNewCase(!showNewCase)}
              className="nc-btn text-xs py-2"
            >
              ➕ Novo Caso
            </button>
            <button
              onClick={() => setShowEdit(!showEdit)}
              className="nc-btn text-xs py-2"
            >
              ✏️ Atualizar Dados
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => alert('Use o botão de arquivo no chat para enviar documentos.')}
              className="nc-btn text-xs py-2"
            >
              📤 Enviar Documento
            </button>
            <button
              onClick={() => alert('Exportação de histórico será implementada em breve.')}
              className="nc-btn text-xs py-2"
            >
              📄 Exportar Histórico
            </button>
          </div>

          {showNewCase && (
            <form onSubmit={handleCreateCase} className="bg-white border border-nc-gray-200 rounded p-3 space-y-2">
              <p className="text-sm font-bold text-nc-text-title">Novo Caso</p>
              <input
                type="text"
                value={newCase.title}
                onChange={(e) => setNewCase({ ...newCase, title: e.target.value })}
                placeholder="Título do caso"
                className="nc-input text-xs"
                required
              />
              <input
                type="text"
                value={newCase.legal_area}
                onChange={(e) => setNewCase({ ...newCase, legal_area: e.target.value })}
                placeholder="Área jurídica"
                className="nc-input text-xs"
              />
              <input
                type="text"
                value={newCase.case_type}
                onChange={(e) => setNewCase({ ...newCase, case_type: e.target.value })}
                placeholder="Tipo de caso"
                className="nc-input text-xs"
              />
              <select
                value={newCase.priority}
                onChange={(e) => setNewCase({ ...newCase, priority: e.target.value })}
                className="nc-input text-xs"
              >
                <option value="baixa">Baixa prioridade</option>
                <option value="media">Média prioridade</option>
                <option value="alta">Alta prioridade</option>
              </select>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={creatingCase}
                  className="nc-btn-primary text-xs py-1.5 flex-1 disabled:opacity-50"
                >
                  {creatingCase ? 'Criando...' : 'Criar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewCase(false)}
                  className="nc-btn text-xs py-1.5"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {showEdit && (
            <form onSubmit={handleUpdateCustomer} className="bg-white border border-nc-gray-200 rounded p-3 space-y-2">
              <p className="text-sm font-bold text-nc-text-title">Atualizar Dados</p>
              <input
                type="text"
                value={editData.client_name}
                onChange={(e) => setEditData({ ...editData, client_name: e.target.value })}
                placeholder="Nome"
                className="nc-input text-xs"
              />
              <input
                type="text"
                value={editData.municipality}
                onChange={(e) => setEditData({ ...editData, municipality: e.target.value })}
                placeholder="Município"
                className="nc-input text-xs"
              />
              <input
                type="text"
                value={editData.state}
                onChange={(e) => setEditData({ ...editData, state: e.target.value })}
                placeholder="UF"
                className="nc-input text-xs"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="nc-btn-primary text-xs py-1.5 flex-1 disabled:opacity-50"
                >
                  {savingEdit ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEdit(false)}
                  className="nc-btn text-xs py-1.5"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

