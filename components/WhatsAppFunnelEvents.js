const EVENT_LABELS = {
  first_contact: 'Primeiro contato',
  qualification: 'Qualificação',
  proposal_sent: 'Proposta enviada',
  negotiation: 'Negociação',
  closed: 'Fechado',
  lost: 'Perdido'
};

export default function WhatsAppFunnelEvents({ events }) {
  if (!events || events.length === 0) {
    return <p className="text-sm text-gray-400">Nenhum evento de funil registrado.</p>;
  }

  return (
    <div className="p-4 bg-[#1B1D1E] border border-gray-800 rounded">
      <h2 className="text-sm font-bold text-white mb-3">Eventos de funil</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left" aria-label="Lista de eventos de funil de WhatsApp">
          <thead className="bg-[#1E2022]">
            <tr>
              <th className="p-2 border border-gray-800">Data</th>
              <th className="p-2 border border-gray-800">Evento</th>
              <th className="p-2 border border-gray-800">Origem</th>
              <th className="p-2 border border-gray-800">Conversa</th>
            </tr>
          </thead>
          <tbody>
            {events.map(e => (
              <tr key={e.id} className="border-b border-gray-800">
                <td className="p-2 border border-gray-800">
                  {e.created_at ? new Date(e.created_at).toLocaleString('pt-BR') : '-'}
                </td>
                <td className="p-2 border border-gray-800">
                  {EVENT_LABELS[e.to_stage] || e.to_stage}
                </td>
                <td className="p-2 border border-gray-800">{e.changed_by || 'sistema'}</td>
                <td className="p-2 border border-gray-800">{e.conversation_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
