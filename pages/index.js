import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import axios from 'axios';
import { useRouter } from 'next/router';
import ChatList from '../components/ChatList';
import ChatWindow from '../components/ChatWindow';
import ClientsList from '../components/ClientsList';
import FunnelKanban from '../components/FunnelKanban';
import MetricsDashboard from '../components/MetricsDashboard';
import UserManagement from '../components/UserManagement';
import AgendaPanel from '../components/AgendaPanel';
import CollaborationPanel from '../components/CollaborationPanel';
import CasesPanel from '../components/CasesPanel';
import DocumentTemplatesManager from '../components/DocumentTemplatesManager';
import LegalRoutinesManager from '../components/LegalRoutinesManager';
import CaseInsightsPanel from '../components/CaseInsightsPanel';
import FeeServiceAdmin from '../components/FeeServiceAdmin';
import OfficeAIAssistant from '../components/OfficeAIAssistant';
import Login from '../components/Login';
import Setup from './setup';
import { useAuth } from '../lib/useAuth';
import useAreaFilter from '../hooks/useAreaFilter';
import { normalizeLegalArea } from '../lib/legalAreas';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AreaFilterSelector from '../components/AreaFilterSelector';
import ActiveFilterBanner from '../components/ActiveFilterBanner';
import NotificationPermissionPrompt from '../components/NotificationPermissionPrompt';
import ProfilePanel from '../components/ProfilePanel';
import { maybeNotify, getPermission, isSupported } from '../lib/notifications';
import { getAuthHeaders } from '../lib/api';
import { normalizePhoneForMatch } from '../lib/formatters';

export default function Home() {
  const router = useRouter();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const queryProcessed = useRef({ tab: false, conversation: false });
  const { authUser, profile, loading: authLoading, signOut, canAccess } = useAuth();
  const { selectedArea, setSelectedArea } = useAreaFilter();
  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [startingConversation, setStartingConversation] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState(null);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setLoading(false);
      return;
    }

    setSupabaseReady(true);

    if (authUser) {
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
  }, [authUser]);

  // Mantém a conversa selecionada sincronizada com o array de conversas
  useEffect(() => {
    if (selectedConversation && conversations.length > 0) {
      const updated = conversations.find(c => c.id === selectedConversation.id);
      if (updated && updated !== selectedConversation) {
        setSelectedConversation(updated);
      }
    }
  }, [conversations]);

  // Busca preferências de notificação e agenda prompt de permissão
  useEffect(() => {
    if (!authUser || !profile) return;

    const load = async () => {
      try {
        const headers = await getAuthHeaders();
        const { data } = await axios.get('/api/notification-preferences', { headers });
        setNotifPrefs(data);

        if (isSupported() && getPermission() === 'default' && (!data.ask_again_after || new Date(data.ask_again_after) < new Date())) {
          setShowNotifPrompt(true);
        }
      } catch (e) {
        console.error('[NOTIFICATIONS] Erro ao carregar preferências:', e);
      }
    };

    load();
  }, [authUser, profile]);

  // O filtro global inicia em "Todas as áreas" (vazio).
  // A preferência é controlada pelo AreaFilterContext + localStorage.
  // Aqui salvamos a preferência normalizada no perfil sem forçar um fallback.
  useEffect(() => {
    if (!authUser || !profile) return;
    if (selectedArea === (profile.preferred_legal_area ? normalizeLegalArea(profile.preferred_legal_area) : '')) return;

    const save = async () => {
      try {
        const headers = await getAuthHeaders();
        await axios.patch('/api/user-preferences', { preferred_legal_area: normalizeLegalArea(selectedArea) }, { headers });
      } catch (e) {
        console.error('[AREA-FILTER] Erro ao salvar preferência:', e);
      }
    };

    save();
  }, [selectedArea, authUser, profile]);

  // Realtime: novas mensagens (conversations.unread)
  useEffect(() => {
    if (!authUser || !notifPrefs) return;

    const channel = supabase
      .channel('conversations-notifications')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        (payload) => {
          const conv = payload.new;
          if (conv.unread && conv.assigned_user_id === profile.id && notifPrefs.enabled && notifPrefs.notify_messages) {
            const clientName = conv.client_name || 'Cliente';
            maybeNotify({
              title: 'Nova mensagem no WhatsApp',
              body: `${clientName} enviou uma mensagem`,
              tag: `msg-${conv.id}`,
              preferences: notifPrefs,
              onClick: () => {
                setSelectedConversation(conv);
                setActiveTab('chat');
                if (typeof window !== 'undefined') {
                  window.history.pushState(null, '', `/?tab=chat&conversation=${conv.id}`);
                }
              }
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authUser, profile, notifPrefs]);

  // Interpreta query string vindas de busca global e atalhos
  useEffect(() => {
    if (!router.isReady) return;

    const { tab, conversation, case: caseId, new: newParam } = router.query;

    if (tab && typeof tab === 'string' && !queryProcessed.current.tab) {
      setActiveTab(tab);
      queryProcessed.current.tab = true;
    }

    if (tab === 'chat' && newParam === '1' && !queryProcessed.current.conversation) {
      setShowNewConvModal(true);
      setSelectedConversation(null);
      queryProcessed.current.conversation = true;
      // Limpa o parâmetro para não reabrir ao voltar
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/?tab=chat');
      }
    }

    if (tab === 'chat' && conversation && conversations.length > 0 && !queryProcessed.current.conversation) {
      const conv = conversations.find(c => c.id === conversation);
      if (conv) {
        setSelectedConversation(conv);
        queryProcessed.current.conversation = true;
      }
    }

    if (tab === 'cases' && caseId) {
      // Caso selecionado será gerenciado pelo CasesPanel via query
    }
  }, [router.isReady, router.query, conversations]);

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
    fetchConversations();
  };

  const handleLogout = async () => {
    await signOut();
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
      // Normaliza o telefone (ignora 9 opcional no mesmo DDD)
      const phone = newPhone.replace(/\D/g, '');
      const phoneNormalized = normalizePhoneForMatch(phone);

      // Busca conversa existente mais antiga com esse número normalizado
      const { data: existing, error: searchError } = await supabase
        .from('conversations')
        .select('*')
        .eq('client_phone_normalized', phoneNormalized)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      let targetConversation = existing;

      if (searchError) throw searchError;

      if (!targetConversation) {
        // Cria nova conversa
        const { data: conversation, error: convError } = await supabase
          .from('conversations')
          .insert({
            client_phone: phone,
            client_phone_normalized: phoneNormalized,
            client_name: newName.trim() || 'Novo contato',
            status: 'open',
            mode: 'human',
            unread: false,
            archived: false
          })
          .select()
          .single();

        if (convError) {
          // Conflito de telefone único: busca a existente
          if (convError.code === '23505') {
            const { data: existingAfter } = await supabase
              .from('conversations')
              .select('*')
              .eq('client_phone_normalized', phoneNormalized)
              .order('created_at', { ascending: true })
              .limit(1)
              .single();
            targetConversation = existingAfter;
          } else {
            throw convError;
          }
        } else {
          targetConversation = conversation;
        }
      }

      if (!targetConversation) throw new Error('Não foi possível localizar ou criar a conversa');

      // Envia mensagem inicial se houver texto
      if (newMessage.trim() && targetConversation?.id) {
        const { data: authData } = await supabase.auth.getSession();
        const headers = authData?.session?.access_token 
          ? { Authorization: `Bearer ${authData.session.access_token}` }
          : {};
        await axios.post('/api/send-message', {
          conversation_id: targetConversation.id,
          text: newMessage,
          media_url: null,
          media_type: null
        }, { headers });
      }

      if (!convError) {
        setConversations([conversation, ...conversations]);
      } else {
        fetchConversations();
      }
      setSelectedConversation(targetConversation);
      setShowNewConvModal(false);
      setNewPhone('');
      setNewName('');
      setNewMessage('');
      setActiveTab('chat');
    } catch (error) {
      console.error('Erro ao iniciar conversa:', error);
      alert('Erro ao iniciar conversa: ' + error.message);
    } finally {
      setStartingConversation(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-nc-surface">
        <p className="text-nc-text-secondary">Carregando...</p>
      </div>
    );
  }

  if (!authUser) {
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
      
      <div className="flex flex-col md:flex-row h-screen bg-nc-surface overflow-hidden">
        <Sidebar activeTab={activeTab} onChangeTab={setActiveTab} />

        {/* Conteúdo principal */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <header className="flex items-center justify-between md:justify-end px-3 py-2 bg-white border-b border-gray-200 z-10">
            <h1 className="md:hidden text-base font-bold">N&C</h1>
            <AreaFilterSelector compact />
          </header>
          <ActiveFilterBanner />
          <main className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden relative min-h-0 pb-16 md:pb-0">
          {activeTab === 'chat' ? (
            <>
              <div
                className={`${
                  selectedConversation ? 'hidden md:flex' : 'flex'
                } w-full md:w-80 flex-shrink-0 h-full`}
              >
                <ChatList
                  conversations={conversations}
                  selectedConversation={selectedConversation}
                  onSelectConversation={async (conv) => {
                    setSelectedConversation(conv);
                    if (conv.unread) {
                      const { error } = await supabase
                        .from('conversations')
                        .update({ unread: false })
                        .eq('id', conv.id);

                      if (error) {
                        console.error('[FRONTEND] Erro ao marcar como lida:', error);
                      } else {
                        setConversations(prev => prev.map(c =>
                          c.id === conv.id ? { ...c, unread: false } : c
                        ));
                      }
                    }
                  }}
                  loading={loading}
                  onNewConversation={() => setShowNewConvModal(true)}
                  onDeleteConversation={handleDeleteConversation}
                  deletingId={deletingId}
                />
              </div>
              {selectedConversation && (
                <div className="w-full md:flex-1 h-full flex flex-col">
                  <ChatWindow
                    conversation={selectedConversation}
                    onConversationUpdate={fetchConversations}
                    onBack={() => setSelectedConversation(null)}
                  />
                </div>
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
          ) : activeTab === 'agenda' ? (
            <AgendaPanel />
          ) : activeTab === 'collaboration' ? (
            <CollaborationPanel conversationId={selectedConversation?.id} caseId={null} />
          ) : activeTab === 'cases' ? (
            <CasesPanel />
          ) : activeTab === 'templates' ? (
            <DocumentTemplatesManager />
          ) : activeTab === 'routines' ? (
            <LegalRoutinesManager />
          ) : activeTab === 'insights' ? (
            <CaseInsightsPanel />
          ) : activeTab === 'ai_assistant' ? (
            <OfficeAIAssistant />
          ) : activeTab === 'metrics' ? (
            <MetricsDashboard conversations={conversations} />
          ) : activeTab === 'fee-services' ? (
            <FeeServiceAdmin />
          ) : activeTab === 'profile' ? (
            <ProfilePanel />
          ) : (
            <UserManagement />
          )}
        </main>
      </div>

        {/* Modal de nova conversa */}
        {showNotifPrompt && (
          <NotificationPermissionPrompt
            profile={profile}
            onClose={() => setShowNotifPrompt(false)}
            onUpdate={async () => {
              try {
                const headers = await getAuthHeaders();
                const { data } = await axios.get('/api/notification-preferences', { headers });
                setNotifPrefs(data);
              } catch (e) {
                console.error('[NOTIFICATIONS] Erro ao recarregar preferências:', e);
              }
            }}
          />
        )}

        {showNewConvModal && (
          <div className="fixed inset-0 bg-nc-black/70 flex items-center justify-center z-50">
            <div className="bg-nc-white rounded-nc p-6 w-96 shadow-card border border-nc-gray-300">
              <h2 className="text-lg font-bold mb-4 text-nc-text-title">Iniciar conversa</h2>
              <form onSubmit={handleStartConversation} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-nc-text-secondary mb-1">Número do WhatsApp</label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="5573999999999"
                    className="nc-input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-nc-text-secondary mb-1">Nome (opcional)</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nome do contato"
                    className="nc-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-nc-text-secondary mb-1">Mensagem inicial (opcional)</label>
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Olá, tudo bem?"
                    className="nc-input resize-none"
                    rows="3"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewConvModal(false)}
                    className="nc-btn flex-1"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={startingConversation}
                    className="nc-btn-primary flex-1 disabled:opacity-50"
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
