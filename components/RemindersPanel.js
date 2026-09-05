import { useState, useEffect } from 'react';
import { apiCall } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';

const REMINDER_TYPES = [
  { value: 'audiencia', label: '⚖️ Audiência' },
  { value: 'reuniao', label: '🤝 Reunião' },
  { value: 'documento', label: '📄 Documento pendente' },
  { value: 'prazo', label: '⏰ Prazo processual' },
  { value: 'andamento', label: '📊 Atualização de andamento' },
  { value: 'manual', label: '📝 Manual' }
];

export default function RemindersPanel({ conversation }) {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    type: 'manual',
    title: '',
    message: '',
    scheduled_for: ''
  });

  useEffect(() => {
    fetchReminders();
  }, [conversation.id]);

  const fetchReminders = async () => {
    try {
      const response = await apiCall(`/api/reminders?conversation_id=${conversation.id}`);
      const data = await response.json();
      setReminders(data.reminders || []);
    } catch (error) {
      console.error('Erro ao buscar lembretes:', error);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.message || !formData.scheduled_for) return;

    setLoading(true);
    try {
      const title = formData.title || formData.message;
      await apiCall('/api/reminders', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: conversation.id,
          client_phone: conversation.client_phone,
          type: formData.type,
          title,
          message: formData.message,
          scheduled_for: new Date(formData.scheduled_for).toISOString()
        })
      });
      
      setFormData({ type: 'manual', title: '', message: '', scheduled_for: '' });
      fetchReminders();
    } catch (error) {
      console.error('Erro ao criar lembrete:', error);
      alert('Erro ao criar lembrete');
    } finally {
      setLoading(false);
    }
  };

  const handleSendNow = async (id) => {
    try {
      await apiCall('/api/reminders', {
        method: 'PUT',
        body: JSON.stringify({ id, send_now: true })
      });
      fetchReminders();
      alert('Mensagem enviada agora!');
    } catch (error) {
      console.error('Erro ao enviar:', error);
      alert('Erro ao enviar mensagem');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deseja excluir este lembrete?')) return;
    
    try {
      await apiCall(`/api/reminders?id=${id}`, { method: 'DELETE' });
      fetchReminders();
    } catch (error) {
      console.error('Erro ao excluir:', error);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString('pt-BR');
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'sent': return 'bg-nc-gray-100 text-nc-text border-nc-gray-200';
      case 'pending': return 'bg-nc-yellow-50 text-nc-text border-nc-yellow-200';
      case 'failed': return 'bg-nc-gray-100 text-red-600 border-red-300';
      default: return 'bg-nc-gray-100 text-nc-text border-nc-gray-200';
    }
  };

  return (
    <div className="nc-card p-4 space-y-4">
      <h3 className="font-bold text-nc-text-title">⏰ Lembretes</h3>

      <form onSubmit={handleCreate} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-nc-text-secondary mb-1">Tipo</label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            className="nc-input"
          >
            {REMINDER_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-nc-text-secondary mb-1">Título (opcional)</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Ex: Audiência de conciliação"
            className="nc-input"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-nc-text-secondary mb-1">Mensagem</label>
          <textarea
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            placeholder="Ex: Olá! Lembramos que sua audiência está marcada para amanhã às 14h."
            rows="3"
            className="nc-input resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-nc-text-secondary mb-1">Agendar para</label>
          <input
            type="datetime-local"
            value={formData.scheduled_for}
            onChange={(e) => setFormData({ ...formData, scheduled_for: e.target.value })}
            className="nc-input"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full nc-btn-primary disabled:opacity-50"
        >
          {loading ? 'Agendando...' : '⏰ Agendar Lembrete'}
        </button>
      </form>

      <div className="border-t border-nc-gray-200 pt-3">
        <h4 className="font-semibold text-sm text-nc-text-title mb-2">Lembretes agendados</h4>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {reminders.map(reminder => (
            <div key={reminder.id} className="bg-nc-gray-50 p-3 rounded-nc text-sm border border-nc-gray-200">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="font-semibold text-nc-text">{reminder.title}</p>
                  <p className="text-nc-text-secondary text-xs mt-1">{reminder.message}</p>
                  <p className="text-nc-text-muted text-xs mt-1">{formatDate(reminder.scheduled_for)}</p>
                  <span className={`inline-block mt-2 text-xs px-2 py-1 rounded-full border ${getStatusStyle(reminder.status)}`}>
                    {reminder.status === 'sent' ? 'Enviado' : 'Pendente'}
                  </span>
                </div>
                <div className="flex gap-1 ml-2">
                  {reminder.status === 'pending' && (
                    <button
                      onClick={() => handleSendNow(reminder.id)}
                      title="Enviar agora"
                      className="p-1 text-nc-text hover:text-nc-yellow hover:bg-nc-white rounded transition"
                    >
                      📤
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(reminder.id)}
                    title="Excluir"
                    className="p-1 text-nc-text hover:text-red-600 hover:bg-nc-white rounded transition"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {reminders.length === 0 && (
            <p className="text-nc-text-muted text-xs text-center py-4">Nenhum lembrete agendado</p>
          )}
        </div>
      </div>
    </div>
  );
}

