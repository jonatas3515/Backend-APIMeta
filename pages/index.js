import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import axios from 'axios';
import ChatList from '../components/ChatList';
import ChatWindow from '../components/ChatWindow';
import ClientsList from '../components/ClientsList';
import FunnelKanban from '../components/FunnelKanban';
import MetricsDashboard from '../components/MetricsDashboard';
import Login from '../components/Login';
import Setup from './setup';
import Head from 'next/head';

export default function Home() {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [startingConversation, setStartingConversation] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    // Verificar autenticação
    const token = localStorage.getItem('chat_auth_token');
    if (token) {
      setIsAuthenticated(true);
    }
    setCheckingAuth(false);

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setLoading(false);
      return;
    }

    setSupabaseReady(true);
    if (token) {
      fetchConversations();
    }

    const subscription = supabase
      .channel('conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        (payload) => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchConversations = async () => {
    try {
      console.log('[FRONTEND] Buscando conversas...');
      const { data, error } = await supabase
        .from('conversations')
        .select('*, messages(created_at, text)')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[FRONTEND] Erro ao buscar conversas:', error);
        throw error;
      }
      
      console.log('[FRONTEND] Conversas encontradas:', data?.length || 0);
      console.log('[FRONTEND] Dados:', data);
      setConversations(data || []);
      setLoading(false);
    } catch (error) {
      console.error('[FRONTEND] Erro ao buscar conversas:', error);
      setLoading(false);
    }
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
    fetchConversations();
  };

  const handleLogout = () => {
    localStorage.removeItem('chat_auth_token');
    setIsAuthenticated(false);
  };

  const handleDeleteConversation = async (conv) => {
    if (!confirm('Tem certeza que deseja excluir esta conversa? Isso apagará todo o histórico.')) {
      return;
    }

    setDeletingId(conv.id);
    try {
      // Deleta mensagens primeiro (CASCADE faz isso, mas por segurança)
      await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', conv.id);

      // Deleta a conversa
      await supabase
        .from('conversations')
        .delete()
        .eq('id', conv.id);

      setConversations(conversations.filter(c => c.id !== conv.id));
      if (selectedConversation?.id === conv.id) {
        setSelectedConversation(null);
      }
    } catch (error) {
      console.error('Erro ao excluir conversa:', error);
      alert('Erro ao excluir conversa');
    } finally {
      setDeletingId(null);
    }
  };

  const handleStartConversation = async (e) => {
    e.preventDefault();
    if (!newPhone.trim()) return;

    setStartingConversation(true);
    try {
      // Normaliza o telefone (só números)
      const phone = newPhone.replace(/\D/g, '');

      // Cria conversa no Supabase
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          client_phone: phone,
          client_name: newName.trim() || 'Novo contato',
          status: 'open',
          mode: 'human',
          unread: false,
          archived: false
        })
        .select()
        .single();

      if (convError) {
        // Pode ser conflito de telefone único; busca existente
        if (convError.code === '23505') {
          const { data: existing } = await supabase
            .from('conversations')
            .select('*')
            .eq('client_phone', phone)
            .single();
          if (existing) {
            setSelectedConversation(existing);
            setShowNewConvModal(false);
            setActiveTab('chat');
          }
        } else {
          throw convError;
        }
      } else {
        // Envia mensagem inicial se houver texto
        if (newMessage.trim()) {
          await axios.post('/api/send-message', {
            conversation_id: conversation.id,
            text: newMessage,
            media_url: null,
            media_type: null
          });
        }

        setConversations([conversation, ...conversations]);
        setSelectedConversation(conversation);
        setShowNewConvModal(false);
        setNewPhone('');
        setNewName('');
        setNewMessage('');
        setActiveTab('chat');
      }
    } catch (error) {
      console.error('Erro ao iniciar conversa:', error);
      alert('Erro ao iniciar conversa: ' + error.message);
    } finally {
      setStartingConversation(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  if (!supabaseReady) {
    return <Setup />;
  }

  return (
    <>
      <Head>
        <title>Chat N&C - Advocacia</title>
        <link rel="icon" href="/Logo transparente.png" />
      </Head>
      
      <div className="flex h-screen bg-gray-100">
        {/* Sidebar com logo e navegação */}
        <div className="w-20 bg-gradient-to-b from-nc-yellow to-nc-yellow-500 flex flex-col items-center py-6 space-y-6 border-r-4 border-black">
          <img src="/Logo transparente.png" alt="N&C Logo" className="w-12 h-12 object-contain" />
          
          <div className="flex flex-col space-y-4 mt-8">
            <button
              onClick={() => setActiveTab('chat')}
              className={`p-3 rounded-lg transition ${
                activeTab === 'chat' 
                  ? 'bg-black text-nc-yellow' 
                  : 'text-black hover:bg-nc-yellow-300'
              }`}
              title="Chat"
            >
              💬
            </button>
            <button
              onClick={() => setActiveTab('clients')}
              className={`p-3 rounded-lg transition ${
                activeTab === 'clients' 
                  ? 'bg-black text-nc-yellow' 
                  : 'text-black hover:bg-nc-yellow-300'
              }`}
              title="Clientes"
            >
              👥
            </button>
            <button
              onClick={() => setActiveTab('funnel')}
              className={`p-3 rounded-lg transition ${
                activeTab === 'funnel' 
                  ? 'bg-black text-nc-yellow' 
                  : 'text-black hover:bg-nc-yellow-300'
              }`}
              title="Funil"
            >
              🎯
            </button>
            <button
              onClick={() => setActiveTab('metrics')}
              className={`p-3 rounded-lg transition ${
                activeTab === 'metrics' 
                  ? 'bg-black text-nc-yellow' 
                  : 'text-black hover:bg-nc-yellow-300'
              }`}
              title="Métricas"
            >
              📊
            </button>
          </div>

          {/* Botão de logout no final */}
          <div className="mt-auto">
            <button
              onClick={handleLogout}
              className="p-3 rounded-lg transition text-black hover:bg-red-500 hover:text-white"
              title="Sair"
            >
              🚪
            </button>
          </div>
        </div>

        {/* Conteúdo principal */}
        {activeTab === 'chat' ? (
          <>
            <ChatList
              conversations={conversations}
              selectedConversation={selectedConversation}
              onSelectConversation={(conv) => {
                setSelectedConversation(conv);
                if (conv.unread) {
                  supabase.from('conversations').update({ unread: false }).eq('id', conv.id);
                }
              }}
              loading={loading}
              onNewConversation={() => setShowNewConvModal(true)}
              onDeleteConversation={handleDeleteConversation}
              deletingId={deletingId}
            />
            {selectedConversation && (
              <ChatWindow
                conversation={selectedConversation}
                onConversationUpdate={fetchConversations}
              />
            )}
          </>
        ) : activeTab === 'clients' ? (
          <ClientsList />
        ) : activeTab === 'funnel' ? (
          <FunnelKanban
            conversations={conversations}
            onSelectConversation={(conv) => {
              setSelectedConversation(conv);
              setActiveTab('chat');
            }}
          />
        ) : (
          <MetricsDashboard conversations={conversations} />
        )}

        {/* Modal de nova conversa */}
        {showNewConvModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
              <h2 className="text-lg font-bold mb-4 text-gray-900">Iniciar conversa</h2>
              <form onSubmit={handleStartConversation} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número do WhatsApp</label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="5573999999999"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome (opcional)</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nome do contato"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem inicial (opcional)</label>
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Olá, tudo bem?"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                    rows="3"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewConvModal(false)}
                    className="flex-1 py-2 px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 text-sm font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={startingConversation}
                    className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold disabled:opacity-50"
                  >
                    {startingConversation ? 'Iniciando...' : 'Iniciar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
