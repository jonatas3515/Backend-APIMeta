import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';

const PRIORITIES = {
  alta: { label: 'Alta', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700 border-red-200' },
  media: { label: 'Média', dot: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  baixa: { label: 'Baixa', dot: 'bg-green-500', badge: 'bg-green-100 text-green-700 border-green-200' }
};

export default function TasksQuickPanel() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('media');
  const [dueDate, setDueDate] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const load = async () => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('done', { ascending: true })
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      setTasks(data || []);
    } catch (err) {
      safeError('tasks_load_error', err, { component: 'TasksQuickPanel' });
      setUnavailable(true);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleDone = async (task) => {
    const next = !task.done;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: next } : t)));
    const { error } = await supabase.from('tasks').update({ done: next }).eq('id', task.id);
    if (error) {
      safeError('tasks_toggle_error', error, { component: 'TasksQuickPanel' });
      load();
    }
  };

  const addTask = async (e) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert({ title: title.trim(), priority, due_date: dueDate || null, done: false })
        .select()
        .single();
      if (error) throw error;
      if (data) setTasks((prev) => [...prev, data]);
      setTitle('');
      setPriority('media');
      setDueDate('');
      setShowForm(false);
    } catch (err) {
      safeError('tasks_add_error', err, { component: 'TasksQuickPanel' });
    } finally {
      setSaving(false);
    }
  };

  const pending = tasks.filter((t) => !t.done).length;

  return (
    <section className="bg-white rounded-lg shadow p-4" data-testid="tasks-quick-panel">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-sm text-gray-800">
          ✅ Tarefas Jurídicas
          {pending > 0 && (
            <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold" data-testid="tasks-pending-count">
              {pending} pendente(s)
            </span>
          )}
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-3 py-1.5 rounded bg-nc-black text-white font-medium hover:opacity-90"
          data-testid="tasks-add-btn"
        >
          {showForm ? 'Cancelar' : '+ Nova Tarefa'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={addTask} className="mb-3 p-3 bg-gray-50 rounded border space-y-2">
          <input
            type="text"
            required
            placeholder="Título da tarefa (ex: Protocolar contestação)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-nc-yellow"
            data-testid="task-title-input"
          />
          <div className="flex gap-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="px-2 py-2 border rounded text-sm flex-1"
            >
              <option value="alta">🔴 Prioridade Alta</option>
              <option value="media">🟡 Prioridade Média</option>
              <option value="baixa">🟢 Prioridade Baixa</option>
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="px-2 py-2 border rounded text-sm flex-1"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2 rounded bg-nc-black text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Adicionar Tarefa'}
          </button>
        </form>
      )}

      {unavailable ? (
        <p className="text-sm text-gray-400">Tarefas indisponíveis (migration 067 pendente no banco).</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma tarefa. Clique em "+ Nova Tarefa" para criar.</p>
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((task) => {
            const p = PRIORITIES[task.priority] || PRIORITIES.media;
            const overdue = task.due_date && !task.done && new Date(task.due_date) < new Date(new Date().toDateString());
            return (
              <li
                key={task.id}
                className={`flex items-center gap-3 p-2 rounded border text-sm ${task.done ? 'bg-gray-50 opacity-60' : 'bg-white'}`}
              >
                <input
                  type="checkbox"
                  checked={!!task.done}
                  onChange={() => toggleDone(task)}
                  className="h-4 w-4 accent-green-600 cursor-pointer"
                  data-testid={`task-check-${task.id}`}
                />
                <span className={`w-2 h-2 rounded-full shrink-0 ${p.dot}`} title={p.label} />
                <span className={`flex-1 ${task.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {task.title}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${p.badge}`}>{p.label}</span>
                {task.due_date && (
                  <span className={`text-[10px] ${overdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                    {new Date(task.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
