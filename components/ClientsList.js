import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function ClientsList() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchClients();

    const subscription = supabase
      .channel('chat-clients-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_clients' },
        () => fetchClients()
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, []);

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('chat_clients')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setClients(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      setLoading(false);
    }
  };

  const filteredClients = clients.filter(client => {
    const search = searchTerm.toLowerCase();
    return (
      client.name?.toLowerCase().includes(search) ||
      client.phone?.includes(search)
    );
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-nc-surface">
        <p className="text-nc-text-muted">Carregando clientes...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-nc-white">
      {/* Header */}
      <div className="bg-nc-white border-b border-nc-gray-200 p-6">
        <h1 className="text-2xl font-bold mb-4 text-nc-text-title">📋 Lista de Clientes</h1>
        
        {/* Barra de pesquisa */}
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por nome ou telefone..."
            className="nc-input py-3"
          />
        </div>
      </div>

      {/* Lista de clientes */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredClients.length === 0 ? (
          <div className="text-center text-nc-text-muted mt-10">
            <p className="text-xl">👥</p>
            <p className="mt-2">
              {searchTerm ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado ainda'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredClients.map((client) => (
              <div
                key={client.id}
                className="nc-card p-4 hover:border-nc-yellow transition"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-nc-text-title">
                      {client.name || 'Sem nome'}
                    </h3>
                    <p className="text-nc-text-secondary mt-1">
                      📱 {client.phone}
                    </p>
                    <div className="flex gap-4 mt-2 text-sm text-nc-text-muted">
                      <span>
                        📅 Primeiro contato: {new Date(client.first_contact_date).toLocaleDateString('pt-BR')}
                      </span>
                      <span>
                        🕐 Último contato: {new Date(client.last_contact_date).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    {client.notes && (
                      <p className="mt-2 text-sm text-nc-text-secondary italic">
                        📝 {client.notes}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="inline-block bg-nc-gray-100 text-nc-text border border-nc-gray-200 px-3 py-1 rounded-full text-sm font-medium">
                      {client.total_messages || 0} msgs
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer com estatísticas */}
      <div className="bg-nc-gray-50 border-t border-nc-gray-200 p-4">
        <div className="flex justify-between text-sm text-nc-text-secondary">
          <span>Total de clientes: <strong className="text-nc-text">{clients.length}</strong></span>
          <span>Exibindo: <strong className="text-nc-text">{filteredClients.length}</strong></span>
        </div>
      </div>
    </div>
  );
}
