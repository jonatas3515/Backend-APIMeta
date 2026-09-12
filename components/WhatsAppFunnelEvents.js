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
    return <p className="text-sm text-nc-text-muted">Nenhum evento de funil registrado.</p>;
  }

  return (
    <div className="p-4 bg-white border border-nc-gray-200 rounded">
      <h2 className="text-sm font-bold text-nc-text-title mb-3">Eventos de funil</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left" aria-label="Lista de eventos de funil de WhatsApp">
          <thead className="bg-nc-gray-100">
            <tr>
              <th className="p-2 border border-nc-gray-200">Data</th>
              <th className="p-2 border border-nc-gray-200">Evento</th>
              <th className="p-2 border border-nc-gray-200">Origem</th>
              <th className="p-2 border border-nc-gray-200">Conversa</th>
            </tr>
          </thead>
          <tbody>
            {events.map(e => (
              <tr key={e.id} className="border-b border-nc-gray-200">
                <td className="p-2 border border-nc-gray-200">
                  {e.created_at ? new Date(e.created_at).toLocaleString('pt-BR') : '-'}
                </td>
                <td className="p-2 border border-nc-gray-200">
                  {EVENT_LABELS[e.to_stage] || e.to_stage}
                </td>
                <td className="p-2 border border-nc-gray-200">{e.changed_by || 'sistema'}</td>
                <td className="p-2 border border-nc-gray-200">{e.conversation_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
