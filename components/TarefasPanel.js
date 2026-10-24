import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';

const PRIORITY_BADGE = {
  alta: 'bg-red-900/40 text-red-300 border-red-700',
  media: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  baixa: 'bg-green-900/40 text-green-300 border-green-700'
};

const STATUS_BADGE = {
  pendente: 'bg-blue-900/40 text-blue-300 border-blue-700',
  em_andamento: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  concluida: 'bg-green-900/40 text-green-300 border-green-700',
  cancelada: 'bg-gray-800 text-gray-400 border-gray-700'
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
      const [tasksRes, clientsRes, casesRes] = await Promise.all([
        supabase.from('tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('conversations').select('id, client_name, phone').order('client_name', { ascending: true }),
        supabase.from('cases').select('id, title, client_name, process_number')
      ]);

      if (tasksRes.error) {
        safeError('tarefas_load_error', tasksRes.error, { component: 'TarefasPanel' });
      } else {
        setTasks(tasksRes.data || []);
      }
      setClients(clientsRes.data || []);
      setCases(casesRes.data || []);
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
      <div key={t.id} className={`p-4 rounded-lg border bg-gray-800 ${isAtrasada ? 'border-red-600' : 'border-gray-700'} hover:border-yellow-500/50 transition-colors`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className={`font-semibold text-sm ${st === 'concluida' ? 'line-through text-gray-400' : 'text-white'}`}>
                {t.title}
              </h4>
              {isAtrasada && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-600 text-white uppercase animate-pulse">
                  Atrasado
                </span>
              )}
            </div>
            {t.description && (
              <p className="text-gray-300 text-xs mb-2 leading-relaxed">{t.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mb-2">
              {linkedCase && (
                <span className="flex items-center gap-1 font-mono text-[11px] text-gray-300">
                  📁 {linkedCase.client_name || linkedCase.title} {linkedCase.process_number ? `(${linkedCase.process_number})` : ''}
                </span>
              )}
              {t.due_date && (
                <span className={`flex items-center gap-1 ${isAtrasada ? 'text-red-400 font-bold' : ''}`}>
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

          <div className="flex items-center gap-2">
            <select
              value={st}
              onChange={(e) => setStatus(t, e.target.value)}
              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-yellow-500"
            >
              <option value="pendente">Pendente</option>
              <option value="em_andamento">Em andamento</option>
              <option value="concluida">Concluída</option>
              <option value="cancelada">Cancelada</option>
            </select>
            <button
              onClick={() => openEdit(t)}
              className="text-yellow-400 hover:text-yellow-300 p-1 text-xs"
              title="Editar tarefa"
            >
              ✏️
            </button>
            <button
              onClick={() => removeTask(t)}
              className="text-red-400 hover:text-red-300 p-1 text-xs"
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
    <div className="min-h-full bg-gray-900 text-white p-4 md:p-6" data-testid="tarefas-panel">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-yellow-500 flex items-center gap-2">
              ✅ Tarefas Jurídicas
            </h1>
            <p className="text-gray-400 text-xs">Gerencie prazos internos, diligências e rotinas do escritório</p>
          </div>
          <button
            onClick={openNew}
            className="px-4 py-2 rounded-lg bg-nc-yellow text-nc-black font-bold text-sm hover:opacity-90 transition shadow"
            data-testid="task-new-btn"
          >
            + Nova Tarefa
          </button>
        </div>

        {msg && (
          <div className={`p-3 rounded-lg text-sm border ${msg.type === 'error' ? 'bg-red-900/50 border-red-700 text-red-200' : 'bg-green-900/50 border-green-700 text-green-200'}`}>
            {msg.text}
          </div>
        )}

        {/* Resumo Rápido (4 cards do legado) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-red-900/20 border border-red-700 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-red-400">{pendentes.length}</div>
            <div className="text-xs text-red-300 mt-1 font-medium">Tarefas Pendentes</div>
          </div>
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-yellow-400">{atrasadas.length}</div>
            <div className="text-xs text-yellow-300 mt-1 font-medium">Atrasadas</div>
          </div>
          <div className="bg-green-900/20 border border-green-700 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-green-400">{concluidas.length}</div>
            <div className="text-xs text-green-300 mt-1 font-medium">Tarefas Concluídas</div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-gray-300">{filtered.length}</div>
            <div className="text-xs text-gray-400 mt-1 font-medium">Total Filtradas</div>
          </div>
        </div>

        {/* Barra de Filtros */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Buscar</label>
              <input
                type="text"
                placeholder="Título ou descrição..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none focus:border-yellow-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Prioridade</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none focus:border-yellow-500"
              >
                <option value="todas">Todas</option>
                <option value="alta">🔴 Alta</option>
                <option value="media">🟡 Média</option>
                <option value="baixa">🟢 Baixa</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none focus:border-yellow-500"
              >
                <option value="todas">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Cliente / Caso</label>
              <select
                value={filterClient}
                onChange={(e) => setFilterClient(e.target.value)}
                className="w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none focus:border-yellow-500"
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
          <p className="text-center py-8 text-gray-400 text-sm">Carregando tarefas...</p>
        ) : (
          <div className="space-y-6">
            {atrasadas.length > 0 && (
              <div className="bg-gray-800/60 rounded-xl border border-red-700 p-4">
                <h3 className="text-sm font-bold text-red-400 mb-3 flex items-center gap-2">
                  <span>⏰</span> Atrasadas ({atrasadas.length})
                </h3>
                <div className="space-y-3">{atrasadas.map(renderCard)}</div>
              </div>
            )}

            {deHoje.length > 0 && (
              <div className="bg-gray-800/60 rounded-xl border border-yellow-700 p-4">
                <h3 className="text-sm font-bold text-yellow-400 mb-3 flex items-center gap-2">
                  <span>📌</span> Para Hoje ({deHoje.length})
                </h3>
                <div className="space-y-3">{deHoje.map(renderCard)}</div>
              </div>
            )}

            {proximos.length > 0 && (
              <div className="bg-gray-800/60 rounded-xl border border-blue-700 p-4">
                <h3 className="text-sm font-bold text-blue-400 mb-3 flex items-center gap-2">
                  <span>🗓️</span> Próximos 7 Dias ({proximos.length})
                </h3>
                <div className="space-y-3">{proximos.map(renderCard)}</div>
              </div>
            )}

            {outras.length > 0 && (
              <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-4">
                <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                  <span>📋</span> Outras / Sem Prazo ({outras.length})
                </h3>
                <div className="space-y-3">{outras.map(renderCard)}</div>
              </div>
            )}

            {pendentes.length === 0 && (
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center text-gray-400">
                <p>Nenhuma tarefa pendente encontrada com os filtros atuais.</p>
              </div>
            )}

            {concluidas.length > 0 && (
              <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4 opacity-75">
                <h3 className="text-sm font-bold text-green-400 mb-3 flex items-center gap-2">
                  <span>✓</span> Concluídas ({concluidas.length})
                </h3>
                <div className="space-y-3">{concluidas.map(renderCard)}</div>
              </div>
            )}
          </div>
        )}

        {/* Modal criar/editar */}
        {modal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
            <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg text-white" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                <h3 className="font-bold text-base text-yellow-500">{modal.mode === 'new' ? '+ Nova Tarefa Jurídica' : 'Editar Tarefa'}</h3>
                <button onClick={() => setModal(null)} className="text-gray-400 hover:text-white">✕</button>
              </div>
              <form onSubmit={saveModal} className="p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Título *</label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: Protocolar contestação, Ligar para cliente..."
                    value={modal.form.title}
                    onChange={(e) => setModal({ ...modal, form: { ...modal.form, title: e.target.value } })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
                    data-testid="task-modal-title"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Descrição</label>
                  <textarea
                    rows={3}
                    placeholder="Detalhes da diligência..."
                    value={modal.form.description}
                    onChange={(e) => setModal({ ...modal, form: { ...modal.form, description: e.target.value } })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">Prioridade</label>
                    <select
                      value={modal.form.priority}
                      onChange={(e) => setModal({ ...modal, form: { ...modal.form, priority: e.target.value } })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
                    >
                      <option value="alta">🔴 Alta</option>
                      <option value="media">🟡 Média</option>
                      <option value="baixa">🟢 Baixa</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">Data Limite</label>
                    <input
                      type="date"
                      value={modal.form.due_date}
                      onChange={(e) => setModal({ ...modal, form: { ...modal.form, due_date: e.target.value } })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Vincular a Processo / Caso</label>
                  <select
                    value={modal.form.case_id || ''}
                    onChange={(e) => setModal({ ...modal, form: { ...modal.form, case_id: e.target.value } })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
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
                  className="w-full py-2.5 rounded-lg bg-nc-yellow text-nc-black text-sm font-bold hover:opacity-90 disabled:opacity-60 transition"
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
