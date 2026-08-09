import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import ChatList from '../components/ChatList';
import ChatWindow from '../components/ChatWindow';
import Setup from './setup';

export default function Home() {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [supabaseReady, setSupabaseReady] = useState(false);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setLoading(false);
      return;
    }

    setSupabaseReady(true);
    fetchConversations();
    const subscription = supabase
      .from('conversations')
      .on('*', (payload) => {
        fetchConversations();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchConversations = async () => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*, messages(created_at, text)')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Erro ao buscar conversas:', error);
      setLoading(false);
    }
  };

  if (!supabaseReady) {
    return <Setup />;
  }

  return (
    <div className="flex h-screen bg-gray-100">
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
    </div>
  );
}
