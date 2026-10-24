import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';

const PRIORITY_BADGE = {
  alta: 'bg-red-100 text-red-700 border-red-200',
  media: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  baixa: 'bg-green-100 text-green-700 border-green-200'
};

const STATUS_FILTERS = [
  { key: 'todas', label: 'Todas' },
  { key: 'pendente', label: 'Pendentes' },
  { key: 'concluida', label: 'Concluídas' }
];

export default function TarefasPanel() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [filterStatus, setFilterStatus] = useState('todas');
  const [filterPriority, setFilterPriority] = useState('todas');
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('media');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

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

  const toggleDone = async (task) => {
    const next = !task.done;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: next } : t)));
    const { error } = await supabase.from('tasks').update({ done: next }).eq('id', task.id);
    if (error) {
      safeError('tarefas_toggle_error', error, { component: 'TarefasPanel' });
      load();
    }
  };

  const addTask = async (e) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('tasks')
      .insert({ title: title.trim(), priority, due_date: dueDate || null, done: false })
      .select()
      .single();
    setSaving(false);
    if (error) {
      safeError('tarefas_add_error', error, { component: 'TarefasPanel' });
      return;
    }
    if (data) setTasks((prev) => [...prev, data]);
    setTitle('');
    setPriority('media');
    setDueDate('');
  };

  const filtered = tasks.filter((t) => {
    if (filterStatus === 'pendente' && t.done) return false;
    if (filterStatus === 'concluida' && !t.done) return false;
    if (filterPriority !== 'todas' && (t.priority || 'media') !== filterPriority) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-4 md:p-6 space-y-4" data-testid="tarefas-panel">
      <h2 className="text-xl font-bold text-gray-900">✅ Tarefas Jurídicas</h2>

      {/* Criacao rapida */}
      <form onSubmit={addTask} className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-2">
        <input
          type="text"
          required
          placeholder="Nova tarefa (ex: Protocolar recurso)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 border rounded text-sm"
          data-testid="task-new-title"
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="px-2 py-2 border rounded text-sm">
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </select>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="px-2 py-2 border rounded text-sm" />
        <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-nc-black text-white text-sm font-medium hover:opacity-90 disabled:opacity-60">
          {saving ? 'Salvando...' : '+ Adicionar'}
        </button>
      </form>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-3 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Buscar tarefa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 border rounded text-sm flex-1 min-w-[160px]"
        />
        <div className="flex gap-1">
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
          <option value="alta">🔴 Alta</option>
          <option value="media">🟡 Média</option>
          <option value="baixa">🟢 Baixa</option>
        </select>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <p className="p-6 text-center text-sm text-gray-500">Carregando tarefas...</p>
        ) : unavailable ? (
          <p className="p-6 text-center text-sm text-gray-400">Tarefas indisponíveis (migration 067 pendente).</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">Nenhuma tarefa encontrada.</p>
        ) : (
          <ul className="divide-y">
            {filtered.map((t) => (
              <li key={t.id} className={`flex items-center gap-3 p-3 ${t.done ? 'bg-gray-50 opacity-60' : ''}`}>
                <input
                  type="checkbox"
                  checked={!!t.done}
                  onChange={() => toggleDone(t)}
                  className="h-4 w-4 accent-green-600 cursor-pointer"
                />
                <span className={`flex-1 text-sm ${t.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.title}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${PRIORITY_BADGE[t.priority] || PRIORITY_BADGE.media}`}>
                  {(t.priority || 'media').toUpperCase()}
                </span>
                {t.due_date && (
                  <span className="text-xs text-gray-500">
                    {new Date(t.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
