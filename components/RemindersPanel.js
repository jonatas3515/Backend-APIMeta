import { useState, useEffect } from 'react';
import axios from 'axios';
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
      const { data } = await axios.get(`/api/reminders?conversation_id=${conversation.id}`);
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
      await axios.post('/api/reminders', {
        conversation_id: conversation.id,
        client_phone: conversation.client_phone,
        type: formData.type,
        title,
        message: formData.message,
        scheduled_for: new Date(formData.scheduled_for).toISOString()
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
      await axios.put('/api/reminders', { id, send_now: true });
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
      await axios.delete(`/api/reminders?id=${id}`);
      fetchReminders();
    } catch (error) {
      console.error('Erro ao excluir:', error);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString('pt-BR');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'sent': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      <h3 className="font-bold text-gray-900">⏰ Lembretes</h3>

      <form onSubmit={handleCreate} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Tipo</label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {REMINDER_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Título (opcional)</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Ex: Audiência de conciliação"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Mensagem</label>
          <textarea
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            placeholder="Ex: Olá! Lembramos que sua audiência está marcada para amanhã às 14h."
            rows="3"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Agendar para</label>
          <input
            type="datetime-local"
            value={formData.scheduled_for}
            onChange={(e) => setFormData({ ...formData, scheduled_for: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 disabled:bg-gray-300 transition"
        >
          {loading ? 'Agendando...' : '⏰ Agendar Lembrete'}
        </button>
      </form>

      <div className="border-t border-gray-200 pt-3">
        <h4 className="font-semibold text-sm text-gray-800 mb-2">Lembretes agendados</h4>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {reminders.map(reminder => (
            <div key={reminder.id} className="bg-gray-50 p-3 rounded-lg text-sm">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{reminder.title}</p>
                  <p className="text-gray-600 text-xs mt-1">{reminder.message}</p>
                  <p className="text-gray-500 text-xs mt-1">{formatDate(reminder.scheduled_for)}</p>
                  <span className={`inline-block mt-2 text-xs px-2 py-1 rounded-full ${getStatusColor(reminder.status)}`}>
                    {reminder.status === 'sent' ? 'Enviado' : 'Pendente'}
                  </span>
                </div>
                <div className="flex gap-1 ml-2">
                  {reminder.status === 'pending' && (
                    <button
                      onClick={() => handleSendNow(reminder.id)}
                      title="Enviar agora"
                      className="p-1 text-green-600 hover:bg-green-100 rounded"
                    >
                      📤
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(reminder.id)}
                    title="Excluir"
                    className="p-1 text-red-600 hover:bg-red-100 rounded"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {reminders.length === 0 && (
            <p className="text-gray-400 text-xs text-center py-4">Nenhum lembrete agendado</p>
          )}
        </div>
      </div>
    </div>
  );
}
