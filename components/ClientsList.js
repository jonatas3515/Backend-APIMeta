import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatPhone } from '../lib/formatters';

export default function ClientsList() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [letterFilter, setLetterFilter] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    fetchClients();

    const subscription = supabase
      .channel('chat-clients-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => fetchClients()
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, []);

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, client_name, client_phone, created_at, updated_at')
        .order('client_name', { ascending: true });

      if (error) throw error;
      setClients(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      setLoading(false);
    }
  };

  const updateClientName = async (clientId, newName) => {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ client_name: newName })
        .eq('id', clientId);

      if (error) throw error;
      setEditingId(null);
      fetchClients();
    } catch (error) {
      console.error('Erro ao atualizar nome:', error);
      alert('Erro ao atualizar nome do cliente');
    }
  };

  const filteredClients = clients.filter(client => {
    const search = searchTerm.toLowerCase();
    const name = client.client_name?.toLowerCase() || '';
    const phone = client.client_phone || '';
    
    // Filtro por texto
    const matchesSearch = name.includes(search) || phone.includes(search);
    
    // Filtro por letra
    const matchesLetter = !letterFilter || name.startsWith(letterFilter.toLowerCase());
    
    return matchesSearch && matchesLetter;
  });

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-nc-surface">
        <p className="text-nc-text-muted">Carregando clientes...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <h1 className="text-2xl font-bold mb-3 text-gray-900">📋 Lista de Clientes</h1>
        
        {/* Barra de pesquisa */}
        <div className="mb-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por nome ou telefone..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Filtro por letra */}
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setLetterFilter('')}
            className={`px-2 py-1 text-xs font-medium rounded transition ${
              letterFilter === ''
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Todos
          </button>
          {alphabet.map(letter => (
            <button
              key={letter}
              onClick={() => setLetterFilter(letter)}
              className={`px-2 py-1 text-xs font-medium rounded transition ${
                letterFilter === letter
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {letter}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de clientes - UMA LINHA POR CLIENTE */}
      <div className="flex-1 overflow-y-auto">
        {filteredClients.length === 0 ? (
          <div className="text-center text-gray-500 mt-10">
            <p className="text-xl">👥</p>
            <p className="mt-2">
              {searchTerm || letterFilter ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado ainda'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {/* Header da tabela */}
            <div className="sticky top-0 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-700 grid grid-cols-12 gap-2 border-b border-gray-300">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Nome</div>
              <div className="col-span-2">Telefone</div>
              <div className="col-span-2">Primeiro Contato</div>
              <div className="col-span-2">Último Contato</div>
              <div className="col-span-1">Mensagens</div>
              <div className="col-span-1">Ações</div>
            </div>

            {/* Linhas de clientes */}
            {filteredClients.map((client, index) => (
              <div
                key={client.id}
                className="px-4 py-2 hover:bg-blue-50 transition grid grid-cols-12 gap-2 items-center text-sm"
              >
                <div className="col-span-1 font-semibold text-gray-600">{index + 1}</div>
                
                <div className="col-span-3">
                  {editingId === client.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => updateClientName(client.id, editingName)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') updateClientName(client.id, editingName);
                      }}
                      autoFocus
                      className="w-full px-2 py-1 border border-blue-500 rounded text-sm"
                    />
                  ) : (
                    <span className="text-gray-900">{client.client_name || 'Sem nome'}</span>
                  )}
                </div>
                
                <div className="col-span-2 text-gray-600">
                  📱 {formatPhone(client.client_phone)}
                </div>
                
                <div className="col-span-2 text-gray-600 text-xs">
                  {new Date(client.created_at).toLocaleDateString('pt-BR')}
                </div>
                
                <div className="col-span-2 text-gray-600 text-xs">
                  {new Date(client.updated_at).toLocaleDateString('pt-BR')}
                </div>
                
                <div className="col-span-1 text-center">
                  <span className="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-medium">
                    0
                  </span>
                </div>
                
                <div className="col-span-1">
                  <button
                    onClick={() => {
                      setEditingId(client.id);
                      setEditingName(client.client_name || '');
                    }}
                    className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                    title="Editar nome"
                  >
                    ✏️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer com estatísticas */}
      <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
        <span>Total: <strong>{clients.length}</strong> | Exibindo: <strong>{filteredClients.length}</strong></span>
      </div>
    </div>
  );
}
