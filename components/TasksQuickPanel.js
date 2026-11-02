import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';

const PRIORITIES = {
  alta: { label: 'Alta', dot: 'bg-red-500', badge: 'bg-red-500/20 text-red-400 border-red-500/30' },
  media: { label: 'Média', dot: 'bg-yellow-500', badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  baixa: { label: 'Baixa', dot: 'bg-green-500', badge: 'bg-green-500/20 text-green-400 border-green-500/30' }
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
    <section className="bg-[#1B1D1E] border border-gray-800 rounded-2xl shadow-lg p-5" data-testid="tasks-quick-panel">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-sm text-white flex items-center gap-2">
          <span>✅</span> Tarefas Jurídicas
          {pending > 0 && (
            <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 font-bold" data-testid="tasks-pending-count">
              {pending} pendente(s)
            </span>
          )}
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition shadow-sm ${
            showForm
              ? 'bg-gray-800 text-gray-300 hover:text-white border border-gray-700'
              : 'bg-nc-yellow text-nc-black hover:brightness-110'
          }`}
          data-testid="tasks-add-btn"
        >
          {showForm ? 'Cancelar' : '+ Nova Tarefa'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={addTask} className="mb-4 p-4 bg-[#1E2022] rounded-xl border border-gray-800 space-y-3">
          <input
            type="text"
            required
            placeholder="Título da tarefa (ex: Protocolar contestação)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-nc-yellow"
            data-testid="task-title-input"
          />
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="px-2.5 py-2 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg text-xs sm:text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-nc-yellow"
            >
              <option value="alta">🔴 Prioridade Alta</option>
              <option value="media">🟡 Prioridade Média</option>
              <option value="baixa">🟢 Prioridade Baixa</option>
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="px-2.5 py-2 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg text-xs sm:text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-nc-yellow"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-nc-yellow hover:bg-yellow-500 text-nc-black font-extrabold text-xs sm:text-sm transition shadow disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Adicionar Tarefa'}
          </button>
        </form>
      )}

      {unavailable ? (
        <p className="text-sm text-gray-400 py-3 text-center">Tarefas indisponíveis.</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">Nenhuma tarefa. Clique em "+ Nova Tarefa" para criar.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => {
            const p = PRIORITIES[task.priority] || PRIORITIES.media;
            const overdue = task.due_date && !task.done && new Date(task.due_date) < new Date(new Date().toDateString());
            return (
              <li
                key={task.id}
                className={`flex items-center gap-3 p-3 rounded-xl border text-xs sm:text-sm transition ${
                  task.done
                    ? 'bg-gray-900/40 border-gray-800/60 opacity-50'
                    : 'bg-[#1E2022] border-gray-800 hover:border-gray-700 text-gray-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!task.done}
                  onChange={() => toggleDone(task)}
                  className="h-4 w-4 accent-yellow-500 cursor-pointer rounded"
                  data-testid={`task-check-${task.id}`}
                />
                <span className={`w-2 h-2 rounded-full shrink-0 ${p.dot}`} title={p.label} />
                <span className={`flex-1 font-medium ${task.done ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                  {task.title}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${p.badge}`}>{p.label}</span>
                {task.due_date && (
                  <span className={`text-[10px] ${overdue ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
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
