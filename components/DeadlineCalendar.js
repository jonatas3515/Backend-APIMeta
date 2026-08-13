import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function DeadlineCalendar() {
  const [deadlines, setDeadlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDays, setFilterDays] = useState(30);

  useEffect(() => {
    fetchDeadlines();
  }, [filterDays]);

  const fetchDeadlines = async () => {
    try {
      const today = new Date();
      const futureDate = new Date(today.getTime() + filterDays * 24 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from('cases')
        .select('id, title, deadline_date, deadline_type, priority, status, conversation_id')
        .gte('deadline_date', today.toISOString().split('T')[0])
        .lte('deadline_date', futureDate.toISOString().split('T')[0])
        .order('deadline_date', { ascending: true });

      if (error) throw error;

      // Agrupa por data
      const grouped = {};
      (data || []).forEach((item) => {
        const date = item.deadline_date;
        if (!grouped[date]) {
          grouped[date] = [];
        }
        grouped[date].push(item);
      });

      setDeadlines(grouped);
    } catch (error) {
      console.error('[DEADLINE_CALENDAR] Erro ao buscar prazos:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const daysUntil = (dateStr) => {
    const today = new Date();
    const deadline = new Date(dateStr + 'T00:00:00');
    const diff = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getPriorityColor = (priority) => {
    const colors = {
      alta: 'border-l-4 border-red-500 bg-red-50',
      media: 'border-l-4 border-yellow-500 bg-yellow-50',
      baixa: 'border-l-4 border-green-500 bg-green-50'
    };
    return colors[priority] || 'border-l-4 border-gray-500 bg-gray-50';
  };

  const getStatusBadge = (status) => {
    const colors = {
      prospect: 'bg-gray-100 text-gray-800',
      em_analise: 'bg-blue-100 text-blue-800',
      proposta_enviada: 'bg-yellow-100 text-yellow-800',
      contrato_assinado: 'bg-purple-100 text-purple-800',
      acao_protocolada: 'bg-orange-100 text-orange-800',
      aguardando_decisao: 'bg-red-100 text-red-800',
      encerrado: 'bg-green-100 text-green-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const sortedDates = Object.keys(deadlines).sort();

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Agenda de Prazos</h2>
        <select
          value={filterDays}
          onChange={(e) => setFilterDays(Number(e.target.value))}
          className="px-3 py-2 border rounded"
        >
          <option value={7}>Próximos 7 dias</option>
          <option value={14}>Próximas 2 semanas</option>
          <option value={30}>Próximos 30 dias</option>
          <option value={90}>Próximos 90 dias</option>
        </select>
      </div>

      {loading ? (
        <p className="text-center text-gray-500">Carregando prazos...</p>
      ) : sortedDates.length === 0 ? (
        <p className="text-center text-gray-500">Nenhum prazo nos próximos {filterDays} dias</p>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((date) => {
            const days = daysUntil(date);
            const isOverdue = days < 0;
            const isUrgent = days >= 0 && days < 7;

            return (
              <div key={date}>
                <div className={`p-4 rounded-lg mb-3 ${isOverdue ? 'bg-red-100' : isUrgent ? 'bg-orange-100' : 'bg-blue-100'}`}>
                  <h3 className="font-bold text-lg">{formatDate(date)}</h3>
                  <p className={`text-sm ${isOverdue ? 'text-red-700 font-bold' : isUrgent ? 'text-orange-700 font-bold' : 'text-blue-700'}`}>
                    {isOverdue ? `${Math.abs(days)} dias atrasado` : `${days} dias`}
                  </p>
                </div>

                <div className="space-y-3 ml-4">
                  {deadlines[date].map((item) => (
                    <div key={item.id} className={`p-4 rounded ${getPriorityColor(item.priority)}`}>
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold">{item.title}</h4>
                        <span className={`text-xs px-2 py-1 rounded ${getStatusBadge(item.status)}`}>
                          {item.status}
                        </span>
                      </div>

                      {item.deadline_type && (
                        <p className="text-sm text-gray-700 mb-2">
                          <strong>Tipo:</strong> {item.deadline_type}
                        </p>
                      )}

                      <p className="text-xs text-gray-600">
                        <strong>Prioridade:</strong> {item.priority}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
