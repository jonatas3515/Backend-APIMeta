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
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Carregando clientes...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-nc-yellow to-nc-yellow-500 text-black p-6 border-b-4 border-black">
        <h1 className="text-2xl font-bold mb-4">📋 Lista de Clientes</h1>
        
        {/* Barra de pesquisa */}
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="🔍 Pesquisar por nome ou telefone..."
            className="w-full px-4 py-3 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
      </div>

      {/* Lista de clientes */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredClients.length === 0 ? (
          <div className="text-center text-gray-500 mt-10">
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
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {client.name || 'Sem nome'}
                    </h3>
                    <p className="text-gray-600 mt-1">
                      📱 {client.phone}
                    </p>
                    <div className="flex gap-4 mt-2 text-sm text-gray-500">
                      <span>
                        📅 Primeiro contato: {new Date(client.first_contact_date).toLocaleDateString('pt-BR')}
                      </span>
                      <span>
                        🕐 Último contato: {new Date(client.last_contact_date).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    {client.notes && (
                      <p className="mt-2 text-sm text-gray-600 italic">
                        📝 {client.notes}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
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
      <div className="bg-gray-50 border-t border-gray-200 p-4">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Total de clientes: <strong>{clients.length}</strong></span>
          <span>Exibindo: <strong>{filteredClients.length}</strong></span>
        </div>
      </div>
    </div>
  );
}
