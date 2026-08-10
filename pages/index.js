import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import ChatList from '../components/ChatList';
import ChatWindow from '../components/ChatWindow';
import ClientsList from '../components/ClientsList';
import Setup from './setup';
import Head from 'next/head';

export default function Home() {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setLoading(false);
      return;
    }

    setSupabaseReady(true);
    fetchConversations();

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
        <div className="w-20 bg-gradient-to-b from-blue-900 to-blue-700 flex flex-col items-center py-6 space-y-6">
          <img src="/Logo transparente.png" alt="N&C Logo" className="w-12 h-12 object-contain" />
          
          <div className="flex flex-col space-y-4 mt-8">
            <button
              onClick={() => setActiveTab('chat')}
              className={`p-3 rounded-lg transition ${
                activeTab === 'chat' 
                  ? 'bg-white text-blue-900' 
                  : 'text-white hover:bg-blue-800'
              }`}
              title="Chat"
            >
              💬
            </button>
            <button
              onClick={() => setActiveTab('clients')}
              className={`p-3 rounded-lg transition ${
                activeTab === 'clients' 
                  ? 'bg-white text-blue-900' 
                  : 'text-white hover:bg-blue-800'
              }`}
              title="Clientes"
            >
              👥
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
