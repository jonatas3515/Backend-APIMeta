import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import ChatList from '../components/ChatList';
import ChatWindow from '../components/ChatWindow';
import ClientsList from '../components/ClientsList';
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
        <div className="w-20 bg-gradient-to-b from-yellow-400 to-yellow-500 flex flex-col items-center py-6 space-y-6 border-r-4 border-black">
          <img src="/Logo transparente.png" alt="N&C Logo" className="w-12 h-12 object-contain" />
          
          <div className="flex flex-col space-y-4 mt-8">
            <button
              onClick={() => setActiveTab('chat')}
              className={`p-3 rounded-lg transition ${
                activeTab === 'chat' 
                  ? 'bg-black text-yellow-400' 
                  : 'text-black hover:bg-yellow-300'
              }`}
              title="Chat"
            >
              💬
            </button>
            <button
              onClick={() => setActiveTab('clients')}
              className={`p-3 rounded-lg transition ${
                activeTab === 'clients' 
                  ? 'bg-black text-yellow-400' 
                  : 'text-black hover:bg-yellow-300'
              }`}
              title="Clientes"
            >
              👥
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
              onSelectConversation={setSelectedConversation}
              loading={loading}
            />
            {selectedConversation && (
              <ChatWindow
                conversation={selectedConversation}
                onConversationUpdate={fetchConversations}
              />
            )}
          </>
        ) : (
          <ClientsList />
        )}
      </div>
    </>
  );
}
