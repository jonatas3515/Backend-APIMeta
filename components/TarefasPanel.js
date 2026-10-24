import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';

const PRIORITY_BADGE = {
  alta: 'bg-red-100 text-red-700 border-red-200',
  media: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  baixa: 'bg-green-100 text-green-700 border-green-200'
};

const STATUS_BADGE = {
  pendente: 'bg-gray-100 text-gray-700 border-gray-200',
  em_andamento: 'bg-blue-100 text-blue-700 border-blue-200',
  concluida: 'bg-green-100 text-green-700 border-green-200',
  cancelada: 'bg-red-100 text-red-500 border-red-200'
};

const STATUS_ORDER = ['pendente', 'em_andamento', 'concluida'];
const STATUS_LABELS = { pendente: 'Pendente', em_andamento: 'Em Andamento', concluida: 'Concluída', cancelada: 'Cancelada' };
const STATUS_FILTERS = [
  { key: 'todas', label: 'Todas' },
  { key: 'pendente', label: 'Pendente' },
  { key: 'em_andamento', label: 'Em Andamento' },
  { key: 'concluida', label: 'Concluída' },
  { key: 'cancelada', label: 'Cancelada' }
];

const EMPTY_FORM = { title: '', description: '', priority: 'media', due_date: '', case_id: '' };

function statusOf(task) {
  return task.status || (task.done ? 'concluida' : 'pendente');
}

export default function TarefasPanel() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [filterStatus, setFilterStatus] = useState('todas');
  const [filterPriority, setFilterPriority] = useState('todas');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // { mode: 'new' | 'edit', form, id }
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('done', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false });
    if (error) {
      safeError('tarefas_load_error', error, { component: 'TarefasPanel' });
      setUnavailable(true);
    } else {
      setTasks(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setStatus = async (task, status) => {
    const patch = { status, done: status === 'concluida', updated_at: new Date().toISOString() };
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...patch } : t)));
    const { error } = await supabase.from('tasks').update(patch).eq('id', task.id);
    if (error) {
      safeError('tarefas_status_error', error, { component: 'TarefasPanel' });
      load();
    }
  };

  const removeTask = async (task) => {
    if (!window.confirm(`Excluir a tarefa "${task.title}"?`)) return;
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
      case_id: task.case_id || ''
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
      setMsg({ type: 'error', text: 'Erro ao salvar tarefa. Verifique a migration 068.' });
      return;
    }
    setModal(null);
    setMsg({ type: 'success', text: modal.mode === 'new' ? 'Tarefa criada.' : 'Tarefa atualizada.' });
    load();
  };

  const filtered = tasks.filter((t) => {
    const st = statusOf(t);
    if (filterStatus !== 'todas' && st !== filterStatus) return false;
    if (filterPriority !== 'todas' && (t.priority || 'media') !== filterPriority) return false;
    const q = search.toLowerCase();
    if (q && !(`${t.title} ${t.description || ''}`.toLowerCase().includes(q))) return false;
    return true;
  });

  return (
    <div className="p-4 md:p-6 space-y-4" data-testid="tarefas-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">✅ Tarefas Jurídicas</h2>
        <button
          onClick={openNew}
          className="px-4 py-2 rounded bg-nc-black text-white text-sm font-bold hover:opacity-90"
          data-testid="task-new-btn"
        >
          + Nova Tarefa
        </button>
      </div>

      {msg && (
        <div className={`p-3 rounded text-sm ${msg.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{msg.text}</div>
      )}

      {/* Busca e filtros */}
      <div className="bg-white rounded-lg shadow p-3 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Buscar por título ou descrição..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 border rounded text-sm flex-1 min-w-[160px]"
        />
        <div className="flex gap-1 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.key}
              onClick={() => setFilterStatus(s.key)}
              className={`px-3 py-1.5 rounded text-xs font-medium ${filterStatus === s.key ? 'bg-nc-black text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="px-2 py-1.5 border rounded text-xs">
          <option value="todas">Todas prioridades</option>
          <option value="baixa">� Baixa</option>
          <option value="media">🟡 Média</option>
          <option value="alta">� Alta</option>
        </select>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <p className="p-6 text-center text-sm text-gray-500">Carregando tarefas...</p>
        ) : unavailable ? (
          <p className="p-6 text-center text-sm text-gray-400">Tarefas indisponíveis (migration 067/068 pendente).</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">Nenhuma tarefa encontrada.</p>
        ) : (
          <ul className="divide-y">
            {filtered.map((t) => {
              const st = statusOf(t);
              const next = STATUS_ORDER[(STATUS_ORDER.indexOf(st) + 1) % STATUS_ORDER.length];
              return (
                <li key={t.id} className={`p-3 flex flex-wrap items-center gap-3 ${st === 'concluida' ? 'bg-gray-50 opacity-60' : ''}`}>
                  <div className="flex-1 min-w-[200px]">
                    <p className={`text-sm font-medium ${st === 'concluida' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                      {t.title}
                    </p>
                    {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                    {t.due_date && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Limite: {new Date(t.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${PRIORITY_BADGE[t.priority] || PRIORITY_BADGE.media}`}>
                    {(t.priority || 'media').toUpperCase()}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${STATUS_BADGE[st] || STATUS_BADGE.pendente}`}>
                    {STATUS_LABELS[st] || 'Pendente'}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setStatus(t, next)}
                      className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium"
                      title={`Marcar como ${STATUS_LABELS[next]}`}
                    >
                      → {STATUS_LABELS[next]}
                    </button>
                    <button onClick={() => openEdit(t)} className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 font-medium">
                      Editar
                    </button>
                    <button onClick={() => removeTask(t)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium">
                      Excluir
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modal criar/editar */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg">{modal.mode === 'new' ? '+ Nova Tarefa' : 'Editar Tarefa'}</h3>
              <button onClick={() => setModal(null)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <form onSubmit={saveModal} className="p-4 space-y-3">
              <input
                required
                type="text"
                placeholder="Título da tarefa *"
                value={modal.form.title}
                onChange={(e) => setModal({ ...modal, form: { ...modal.form, title: e.target.value } })}
                className="w-full px-3 py-2 border rounded text-sm"
                data-testid="task-modal-title"
              />
              <textarea
                rows={3}
                placeholder="Descrição (opcional)"
                value={modal.form.description}
                onChange={(e) => setModal({ ...modal, form: { ...modal.form, description: e.target.value } })}
                className="w-full px-3 py-2 border rounded text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={modal.form.priority}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, priority: e.target.value } })}
                  className="px-2 py-2 border rounded text-sm"
                >
                  <option value="baixa">🟢 Prioridade Baixa</option>
                  <option value="media">🟡 Prioridade Média</option>
                  <option value="alta">🔴 Prioridade Alta</option>
                </select>
                <input
                  type="date"
                  value={modal.form.due_date}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, due_date: e.target.value } })}
                  className="px-2 py-2 border rounded text-sm"
                />
              </div>
              <input
                type="text"
                placeholder="Vínculo: ID do processo/caso (opcional)"
                value={modal.form.case_id}
                onChange={(e) => setModal({ ...modal, form: { ...modal.form, case_id: e.target.value } })}
                className="w-full px-3 py-2 border rounded text-sm"
              />
              <button
                type="submit"
                disabled={saving}
                className="w-full py-2 rounded bg-nc-black text-white text-sm font-bold hover:opacity-90 disabled:opacity-60"
              >
                {saving ? 'Salvando...' : modal.mode === 'new' ? 'Criar Tarefa' : 'Salvar Alterações'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
