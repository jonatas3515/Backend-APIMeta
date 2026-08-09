import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import ChatList from '../components/ChatList';
import ChatWindow from '../components/ChatWindow';

export default function Home() {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
