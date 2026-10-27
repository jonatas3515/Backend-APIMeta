import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';
import { apiJson } from '../lib/apiClient';

const PRIORITY_BADGE = {
  alta: 'bg-red-50 text-red-700 border-red-200',
  media: 'bg-amber-50 text-amber-700 border-amber-200',
  baixa: 'bg-emerald-50 text-emerald-700 border-emerald-200'
};

const STATUS_BADGE = {
  pendente: 'bg-blue-50 text-blue-700 border-blue-200',
  em_andamento: 'bg-amber-50 text-amber-700 border-amber-200',
  concluida: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelada: 'bg-gray-100 text-gray-500 border-gray-200'
};

const STATUS_LABELS = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada'
};

const EMPTY_FORM = { title: '', description: '', priority: 'media', due_date: '', case_id: '', client_name: '' };

function statusOf(task) {
  return task.status || (task.done ? 'concluida' : 'pendente');
}

export default function TarefasPanel() {
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState('todas');
  const [filterStatus, setFilterStatus] = useState('todas');
  const [filterClient, setFilterClient] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // { mode: 'new' | 'edit', form, id }
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try {
      const [tasksRes, clientsRes, casesList] = await Promise.all([
        supabase.from('tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('conversations').select('id, client_name, client_phone').order('client_name', { ascending: true }),
        apiJson('/api/cases').catch(() => [])
      ]);

      if (tasksRes.error) {
        safeError('tarefas_load_error', tasksRes.error, { component: 'TarefasPanel' });
      } else {
        setTasks(tasksRes.data || []);
      }
      setClients(clientsRes.data || []);
      setCases(Array.isArray(casesList) ? casesList : (casesList?.data || []));
    } catch (err) {
      safeError('tarefas_load_catch', err, { component: 'TarefasPanel' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setStatus = async (task, status) => {
    const isDone = status === 'concluida';
    const patch = { status, done: isDone, updated_at: new Date().toISOString() };
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...patch } : t)));
    const { error } = await supabase.from('tasks').update(patch).eq('id', task.id);
    if (error) {
      safeError('tarefas_status_error', error, { component: 'TarefasPanel' });
      load();
    }
  };

  const removeTask = async (task) => {
    if (!window.confirm(`Tem certeza que deseja excluir a tarefa "${task.title}"?`)) return;
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) {
      safeError('tarefas_delete_error', error, { component: 'TarefasPanel' });
      load();
    }
  };

  const openNew = () => setModal({ mode: 'new', form: { ...EMPTY_FORM } });
  const openEdit = (task) => setModal({
    mode: 'edit',
    id: task.id,
    form: {
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'media',
      due_date: task.due_date || '',
      case_id: task.case_id || '',
      client_name: task.client_name || ''
    }
  });

  const saveModal = async (e) => {
    e.preventDefault();
    if (!modal.form.title.trim() || saving) return;
    setSaving(true);
    const payload = {
      title: modal.form.title.trim(),
      description: modal.form.description.trim() || null,
      priority: modal.form.priority,
      due_date: modal.form.due_date || null,
      case_id: modal.form.case_id || null,
      updated_at: new Date().toISOString()
    };
    let error;
    if (modal.mode === 'new') {
      ({ error } = await supabase.from('tasks').insert({ ...payload, status: 'pendente', done: false }));
    } else {
      ({ error } = await supabase.from('tasks').update(payload).eq('id', modal.id));
    }
    setSaving(false);
    if (error) {
      safeError('tarefas_save_error', error, { component: 'TarefasPanel' });
      setMsg({ type: 'error', text: 'Erro ao salvar tarefa.' });
      return;
    }
    setModal(null);
    setMsg({ type: 'success', text: modal.mode === 'new' ? 'Tarefa criada com sucesso!' : 'Tarefa atualizada com sucesso!' });
    setTimeout(() => setMsg(null), 3000);
    load();
  };

  // Classificação temporal
  const classificar = (task) => {
    if (!task.due_date) return 'outras';
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const limite = new Date(task.due_date + 'T00:00:00');
    const diff = Math.ceil((limite.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'atrasada';
    if (diff === 0) return 'hoje';
    if (diff <= 7) return 'proximos';
    return 'outras';
  };

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      const st = statusOf(t);
      if (filterStatus !== 'todas' && st !== filterStatus) return false;
      if (filterPriority !== 'todas' && (t.priority || 'media') !== filterPriority) return false;
      if (filterClient && t.case_id !== filterClient && !(t.title + (t.description || '')).toLowerCase().includes(filterClient.toLowerCase())) return false;
      const q = search.toLowerCase();
      if (q && !(`${t.title} ${t.description || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [tasks, filterStatus, filterPriority, filterClient, search]);

  const pendentes = useMemo(() => filtered.filter((t) => statusOf(t) !== 'concluida' && statusOf(t) !== 'cancelada'), [filtered]);
  const concluidas = useMemo(() => filtered.filter((t) => statusOf(t) === 'concluida'), [filtered]);
  const atrasadas = useMemo(() => pendentes.filter((t) => classificar(t) === 'atrasada'), [pendentes]);
  const deHoje = useMemo(() => pendentes.filter((t) => classificar(t) === 'hoje'), [pendentes]);
  const proximos = useMemo(() => pendentes.filter((t) => classificar(t) === 'proximos'), [pendentes]);
  const outras = useMemo(() => pendentes.filter((t) => classificar(t) === 'outras'), [pendentes]);

  const renderCard = (t) => {
    const st = statusOf(t);
    const isAtrasada = classificar(t) === 'atrasada' && st !== 'concluida';
    const linkedCase = cases.find((c) => c.id === t.case_id);

    return (
      <div key={t.id} className={`p-4 rounded-lg border bg-white ${isAtrasada ? 'border-red-300' : 'border-gray-200'} hover:border-nc-yellow shadow-sm transition-colors`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className={`font-semibold text-sm ${st === 'concluida' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                {t.title}
              </h4>
              {isAtrasada && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-700 border border-red-200 uppercase">
                  Atrasado
                </span>
              )}
            </div>
            {t.description && (
              <p className="text-gray-600 text-xs mb-2 leading-relaxed">{t.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-2">
              {linkedCase && (
                <span className="flex items-center gap-1 font-mono text-[11px] text-gray-600">
                  📁 {linkedCase.client_name || linkedCase.title} {linkedCase.process_number ? `(${linkedCase.process_number})` : ''}
                </span>
              )}
              {t.due_date && (
                <span className={`flex items-center gap-1 ${isAtrasada ? 'text-red-600 font-bold' : ''}`}>
                  ⏰ Limite: {new Date(t.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${PRIORITY_BADGE[t.priority] || PRIORITY_BADGE.media}`}>
                {(t.priority || 'media').toUpperCase()}
              </span>
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${STATUS_BADGE[st] || STATUS_BADGE.pendente}`}>
                {STATUS_LABELS[st] || 'Pendente'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {st === 'concluida' ? (
              <button
                type="button"
                onClick={() => setStatus(t, 'pendente')}
                className="px-2.5 py-1.5 text-xs font-semibold rounded bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 transition flex items-center gap-1"
                title="Reabrir tarefa como pendente"
              >
                ↩ Reabrir
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStatus(t, 'concluida')}
                className="px-2.5 py-1.5 text-xs font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs transition flex items-center gap-1"
                title="Marcar tarefa como cumprida / realizada"
              >
                <span>✓</span> Concluir
              </button>
            )}
            <select
              value={st}
              onChange={(e) => setStatus(t, e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-gray-300 rounded text-gray-800 text-xs focus:outline-none focus:border-nc-yellow focus:ring-1 focus:ring-nc-yellow"
            >
              <option value="pendente">Pendente</option>
              <option value="em_andamento">Em andamento</option>
              <option value="concluida">Concluída</option>
              <option value="cancelada">Cancelada</option>
            </select>
            <button
              onClick={() => openEdit(t)}
              className="text-gray-600 hover:text-yellow-600 p-1.5 text-xs rounded hover:bg-gray-100 transition-colors"
              title="Editar tarefa"
            >
              ✏️
            </button>
            <button
              onClick={() => removeTask(t)}
              className="text-red-500 hover:text-red-700 p-1.5 text-xs rounded hover:bg-red-50 transition-colors"
              title="Excluir tarefa"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-full bg-nc-surface text-gray-900 p-4 md:p-6" data-testid="tarefas-panel">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span>✅</span> Tarefas Jurídicas
            </h1>
            <p className="text-gray-500 text-xs">Gerencie prazos internos, diligências e rotinas do escritório</p>
          </div>
          <button
            onClick={openNew}
            className="px-4 py-2 rounded-lg bg-nc-yellow text-nc-black font-bold text-sm hover:bg-yellow-400 transition shadow-sm"
            data-testid="task-new-btn"
          >
            + Nova Tarefa
          </button>
        </div>

        {msg && (
          <div className={`p-3 rounded-lg text-sm border ${msg.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
            {msg.text}
          </div>
        )}

        {/* Resumo Rápido */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center shadow-sm">
            <div className="text-3xl font-bold text-blue-700">{pendentes.length}</div>
            <div className="text-xs text-blue-600 mt-1 font-medium">Tarefas Pendentes</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center shadow-sm">
            <div className="text-3xl font-bold text-red-700">{atrasadas.length}</div>
            <div className="text-xs text-red-600 mt-1 font-medium">Atrasadas</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center shadow-sm">
            <div className="text-3xl font-bold text-emerald-700">{concluidas.length}</div>
            <div className="text-xs text-emerald-600 mt-1 font-medium">Tarefas Concluídas</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow-sm">
            <div className="text-3xl font-bold text-gray-800">{filtered.length}</div>
            <div className="text-xs text-gray-500 mt-1 font-medium">Total Filtradas</div>
          </div>
        </div>

        {/* Barra de Filtros */}
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Buscar</label>
              <input
                type="text"
                placeholder="Título ou descrição..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-xs focus:outline-none focus:border-nc-yellow focus:ring-1 focus:ring-nc-yellow"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prioridade</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-xs focus:outline-none focus:border-nc-yellow focus:ring-1 focus:ring-nc-yellow"
              >
                <option value="todas">Todas</option>
                <option value="alta">🔴 Alta</option>
                <option value="media">🟡 Média</option>
                <option value="baixa">🟢 Baixa</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-xs focus:outline-none focus:border-nc-yellow focus:ring-1 focus:ring-nc-yellow"
              >
                <option value="todas">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cliente / Caso</label>
              <select
                value={filterClient}
                onChange={(e) => setFilterClient(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-xs focus:outline-none focus:border-nc-yellow focus:ring-1 focus:ring-nc-yellow"
              >
                <option value="">Todos os clientes</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.client_name || c.id}>
                    {c.client_name || c.phone}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Seções agrupadas por urgência */}
        {loading ? (
          <p className="text-center py-8 text-gray-500 text-sm">Carregando tarefas...</p>
        ) : (
          <div className="space-y-6">
            {atrasadas.length > 0 && (
              <div className="bg-white rounded-xl border border-red-200 p-4 shadow-sm">
                <h3 className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2">
                  <span>⏰</span> Atrasadas ({atrasadas.length})
                </h3>
                <div className="space-y-3">{atrasadas.map(renderCard)}</div>
              </div>
            )}

            {deHoje.length > 0 && (
              <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-sm">
                <h3 className="text-sm font-bold text-amber-700 mb-3 flex items-center gap-2">
                  <span>📌</span> Para Hoje ({deHoje.length})
                </h3>
                <div className="space-y-3">{deHoje.map(renderCard)}</div>
              </div>
            )}

            {proximos.length > 0 && (
              <div className="bg-white rounded-xl border border-blue-200 p-4 shadow-sm">
                <h3 className="text-sm font-bold text-blue-700 mb-3 flex items-center gap-2">
                  <span>🗓️</span> Próximos 7 Dias ({proximos.length})
                </h3>
                <div className="space-y-3">{proximos.map(renderCard)}</div>
              </div>
            )}

            {outras.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <span>📋</span> Outras / Sem Prazo ({outras.length})
                </h3>
                <div className="space-y-3">{outras.map(renderCard)}</div>
              </div>
            )}

            {pendentes.length === 0 && concluidas.length === 0 && (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500 shadow-sm">
                <div className="w-12 h-12 bg-amber-50 text-amber-700 rounded-full flex items-center justify-center mx-auto mb-3 text-xl">
                  📝
                </div>
                <h4 className="font-semibold text-gray-800 text-sm mb-1">Nenhuma tarefa cadastrada ainda</h4>
                <p className="text-xs text-gray-500 mb-4 max-w-md mx-auto">
                  Organize diligências, protocolos, contatos com clientes e tarefas internas do escritório vinculadas aos casos ou avulsas.
                </p>
                <button
                  type="button"
                  onClick={openNew}
                  className="px-4 py-2 bg-nc-yellow text-nc-black hover:bg-yellow-400 font-bold rounded-lg text-xs shadow inline-flex items-center gap-1.5 transition-colors"
                >
                  + Criar Primeira Tarefa
                </button>
              </div>
            )}

            {pendentes.length === 0 && concluidas.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500 shadow-sm">
                <p>Nenhuma tarefa pendente com os filtros atuais (todas as tarefas estão concluídas!).</p>
              </div>
            )}

            {concluidas.length > 0 && (
              <div className="bg-white/80 rounded-xl border border-gray-200 p-4 shadow-sm">
                <h3 className="text-sm font-bold text-emerald-700 mb-3 flex items-center gap-2">
                  <span>✓</span> Concluídas ({concluidas.length})
                </h3>
                <div className="space-y-3">{concluidas.map(renderCard)}</div>
              </div>
            )}
          </div>
        )}

        {/* Modal criar/editar */}
        {modal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
            <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-lg text-gray-900" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="font-bold text-base text-gray-900">{modal.mode === 'new' ? '+ Nova Tarefa Jurídica' : 'Editar Tarefa'}</h3>
                <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>
              <form onSubmit={saveModal} className="p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Título *</label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: Protocolar contestação, Ligar para cliente..."
                    value={modal.form.title}
                    onChange={(e) => setModal({ ...modal, form: { ...modal.form, title: e.target.value } })}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-nc-yellow focus:ring-1 focus:ring-nc-yellow"
                    data-testid="task-modal-title"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Descrição</label>
                  <textarea
                    rows={3}
                    placeholder="Detalhes da diligência..."
                    value={modal.form.description}
                    onChange={(e) => setModal({ ...modal, form: { ...modal.form, description: e.target.value } })}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-nc-yellow focus:ring-1 focus:ring-nc-yellow"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Prioridade</label>
                    <select
                      value={modal.form.priority}
                      onChange={(e) => setModal({ ...modal, form: { ...modal.form, priority: e.target.value } })}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-nc-yellow focus:ring-1 focus:ring-nc-yellow"
                    >
                      <option value="alta">🔴 Alta</option>
                      <option value="media">🟡 Média</option>
                      <option value="baixa">🟢 Baixa</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Data Limite</label>
                    <input
                      type="date"
                      value={modal.form.due_date}
                      onChange={(e) => setModal({ ...modal, form: { ...modal.form, due_date: e.target.value } })}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-nc-yellow focus:ring-1 focus:ring-nc-yellow"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Vincular a Processo / Caso</label>
                  <select
                    value={modal.form.case_id || ''}
                    onChange={(e) => setModal({ ...modal, form: { ...modal.form, case_id: e.target.value } })}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-nc-yellow focus:ring-1 focus:ring-nc-yellow"
                  >
                    <option value="">Sem vínculo</option>
                    {cases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.client_name || c.title} {c.process_number ? `(${c.process_number})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2.5 rounded-lg bg-nc-yellow text-nc-black text-sm font-bold hover:bg-yellow-400 disabled:opacity-60 transition shadow-sm"
                >
                  {saving ? 'Salvando...' : modal.mode === 'new' ? 'Criar Tarefa' : 'Salvar Alterações'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
