import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import axios from 'axios';
import { getAuthHeaders } from '../lib/api';
import { formatPhone } from '../lib/formatters';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { maybeNotify } from '../lib/notifications';
import LegalClassification from './LegalClassification';
import RemindersPanel from './RemindersPanel';
import DocumentGenerator from './DocumentGenerator';
import CustomerProfilePanel from './CustomerProfilePanel';
import SignaturePanel from './SignaturePanel';

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatDateLabel(date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return 'Hoje';
  if (isSameDay(date, yesterday)) return 'Ontem';
  return date.toLocaleDateString('pt-BR');
}

export default function ChatWindow({ conversation, onConversationUpdate, onBack }) {
  const [activePanel, setActivePanel] = useState('');
  const topBarRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [internalNotes, setInternalNotes] = useState(conversation.internal_notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [confidential, setConfidential] = useState(conversation.confidential || false);
  const [savingConfidential, setSavingConfidential] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState(conversation.mode);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingAudio, setPendingAudio] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTranscript, setExpandedTranscript] = useState(null);
  const [expandedMedia, setExpandedMedia] = useState(null);
  const [selectedMessages, setSelectedMessages] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);

  // Atalhos contextuais do chat
  useKeyboardShortcuts([
    {
      keys: ['m'],
      handler: async () => {
        try {
          const { error } = await supabase
            .from('conversations')
            .update({ unread: false })
            .eq('id', conversation.id);
          if (error) throw error;
          if (onConversationUpdate) onConversationUpdate();
        } catch (err) {
          console.error('[CHAT] Erro ao marcar como lida:', err);
        }
      }
    },
    {
      keys: ['esc'],
      handler: () => {
        if (showEmojiPicker) {
          setShowEmojiPicker(false);
        } else if (activePanel) {
          setActivePanel('');
        } else if (showPauseMenu) {
          setShowPauseMenu(false);
        }
      }
    }
  ]);

  // Sincroniza o mode local com a conversa atual
  useEffect(() => {
    setMode(conversation.mode);
  }, [conversation.id, conversation.mode]);
  const fileInputRef = useRef(null);

  // Fechar painel ao clicar fora da barra superior
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (topBarRef.current && !topBarRef.current.contains(e.target)) {
        setActivePanel('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const emojis = [
    // Smileys e pessoas
    '�', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
    '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
    '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
    '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
    '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
    '🤧', '🥵', '🥶', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐',
    
    // Gestos e mãos
    '👍', '👎', '👌', '✌️', '🤞', '🤝', '👏', '🙌', '👐', '🤲',
    '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃',
    '👋', '🤚', '🖐️', '✋', '🖖', '👊', '✊', '🤛', '🤜', '🤟',
    
    // Corações e símbolos
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
    '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️',
    
    // Advocacia e trabalho
    '⚖️', '📄', '📝', '💼', '📁', '📂', '🗂️', '📋', '📊', '📈',
    '📉', '🗓️', '📆', '📅', '🗒️', '📇', '📌', '📍', '✂️', '🖊️',
    
    // Outros úteis
    '✅', '❌', '⭐', '🎯', '💯', '🔥', '�', '💬', '💭', '🗨️',
    '📢', '📣', '🔔', '🔕', '📞', '📱', '💻', '⌨️', '🖱️', '🖨️',
    '📧', '📩', '📨', '✉️', '📮', '📪', '📫', '📬', '📭', '🏛️',
    
    // Animais
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
    '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆',
    
    // Comida
    '🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍑', '🍒', '🍍',
    '🥥', '🥝', '🍅', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶️', '🥒',
    '☕', '🍵', '🧃', '🥤', '🍺', '🍻', '🥂', '🍷', '🥃', '🍹',
    
    // Atividades
    '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱',
    '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🥅', '⛳', '🏹', '🎣',
    
    // Viagens
    '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐',
    '🚚', '🚛', '🚜', '🛴', '🚲', '🛵', '🏍️', '🛺', '🚨', '🚔',
    '✈️', '🛫', '🛬', '🚁', '🛩️', '🚀', '🛸', '🚂', '🚆', '🚇',
    
    // Objetos
    '⌚', '📱', '💻', '⌨️', '🖱️', '🖨️', '📷', '📹', '🎥', '📞',
    '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏰',
    '⏱️', '⏲️', '⏳', '⌛', '📡', '🔋', '🔌', '💡', '🔦', '🕯️',
    
    // Símbolos
    '💰', '💴', '💵', '💶', '💷', '💸', '💳', '🧾', '💎', '⚖️',
    '🔨', '⚒️', '🛠️', '⛏️', '🔧', '🔩', '⚙️', '🗜️', '⚗️', '🔬',
    '🔭', '📏', '�', '🧮', '🧲', '🧪', '🧫', '🧬', '�', '�'
  ];

  useEffect(() => {
    fetchMessages();

    // Real-time via Supabase
    const subscription = supabase
      .channel(`messages-${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
          
          // Notificar usuário de nova mensagem
          const msg = payload.new;
          if (msg && msg.sender_type === 'client') {
            maybeNotify({
              title: `Nova mensagem de ${formatPhone(msg.sender_id)}`,
              body: msg.text?.slice(0, 100) || 'Mensagem recebida',
              tag: `msg-${msg.id}`,
              onClick: () => {
                window.focus();
              }
            });
          }
        }
      )
      .subscribe();

    // Fallback de polling rápido (2s) para garantir sincronia
    const pollInterval = setInterval(fetchMessages, 2000);

    return () => {
      subscription.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [conversation.id]);

  useEffect(() => {
    if (!scrollContainerRef.current || !messagesEndRef.current) return;

    const shouldScroll = !initialScrollDoneRef.current || isAtBottomRef.current;

    if (shouldScroll) {
      messagesEndRef.current.scrollIntoView({ behavior: initialScrollDoneRef.current ? 'smooth' : 'auto' });
      initialScrollDoneRef.current = true;
      isAtBottomRef.current = true;
    }
  }, [messages]);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Erro ao buscar mensagens:', error);
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() && !pendingFile && !pendingAudio) return;

    setSending(true);
    try {
      let mediaUrl = null;
      let mediaType = null;
      
      // Se tem arquivo ou áudio pendente, fazer upload via URL assinada
      const fileToUpload = pendingAudio || pendingFile;
      if (fileToUpload) {
        setUploadProgress(10);

        // 1. Buscar URL assinada do backend (service_role)
        const headers = await getAuthHeaders();
        const { data: signedData } = await axios.post('/api/upload-file', {
          fileName: fileToUpload.name,
          fileType: fileToUpload.type,
          conversationId: conversation.id
        }, { headers });

        setUploadProgress(50);

        // 2. Fazer upload DIRETO para a URL assinada (evita limite do Vercel e RLS)
        const uploadResponse = await fetch(signedData.signedUrl, {
          method: 'PUT',
          body: fileToUpload,
          headers: {
            'Content-Type': fileToUpload.type || 'application/octet-stream'
          }
        });

        if (!uploadResponse.ok) {
          throw new Error(`Erro no upload: ${uploadResponse.statusText}`);
        }

        setUploadProgress(90);

        // 3. Obter URL pública
        const { data: urlData } = supabase.storage
          .from('chat-files')
          .getPublicUrl(signedData.filePath);

        mediaUrl = urlData.publicUrl;
        mediaType = fileToUpload.type;
        setUploadProgress(100);
      }

      // Enviar mensagem
      const headers = await getAuthHeaders();
      const { data: sendData } = await axios.post('/api/send-message', {
        conversation_id: conversation.id,
        text: newMessage,
        media_url: mediaUrl,
        media_type: mediaType
      }, { headers });

      console.log('[CHAT] Mensagem enviada:', sendData);
      setNewMessage('');
      setPendingFile(null);
      setPendingAudio(null);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onConversationUpdate();
      fetchMessages(); // Atualiza mensagens imediatamente
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      alert('Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  const handlePauseBot = async (duration) => {
    try {
      const headers = await getAuthHeaders();
      await axios.post('/api/automation-control', {
        conversationId: conversation.id,
        action: 'pause',
        duration
      }, { headers });
      setMode('human');
      setShowPauseMenu(false);
      onConversationUpdate();
    } catch (error) {
      console.error('Erro ao pausar bot:', error);
      alert('Erro ao pausar bot');
    }
  };

  const handleResumeBot = async () => {
    try {
      const headers = await getAuthHeaders();
      await axios.post('/api/automation-control', {
        conversationId: conversation.id,
        action: 'resume'
      }, { headers });
      setMode('bot');
      onConversationUpdate();
    } catch (error) {
      console.error('Erro ao reativar bot:', error);
      alert('Erro ao reativar bot');
    }
  };

  const toggleConfidential = async () => {
    const newValue = !confidential;
    setSavingConfidential(true);
    try {
      await supabase
        .from('conversations')
        .update({ confidential: newValue })
        .eq('id', conversation.id);
      setConfidential(newValue);
      onConversationUpdate();
    } catch (error) {
      console.error('Erro ao alterar sigilo:', error);
      alert('Erro ao alterar sigilo');
    } finally {
      setSavingConfidential(false);
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await supabase
        .from('conversations')
        .update({ internal_notes: internalNotes })
        .eq('id', conversation.id);
      onConversationUpdate();
    } catch (error) {
      console.error('Erro ao salvar notas:', error);
      alert('Erro ao salvar notas');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPendingFile(file);
      setNewMessage(`📎 ${file.name}`);
    }
  };

  const removePendingFile = () => {
    setPendingFile(null);
    setPendingAudio(null);
    setNewMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleMessageSelection = (msgId) => {
    setSelectedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(msgId)) {
        newSet.delete(msgId);
      } else {
        newSet.add(msgId);
      }
      return newSet;
    });
  };

  const deleteSelectedMessages = async () => {
    if (selectedMessages.size === 0) return;
    if (!confirm(`Deseja excluir ${selectedMessages.size} mensagem(ns)?`)) return;

    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .in('id', Array.from(selectedMessages));

      if (error) throw error;

      setMessages(prev => prev.filter(m => !selectedMessages.has(m.id)));
      setSelectedMessages(new Set());
      setSelectionMode(false);
    } catch (err) {
      console.error('[CHAT] Erro ao excluir mensagens:', err);
      alert('Erro ao excluir mensagens');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Usar tipo compatível com WhatsApp
      const mimeType = MediaRecorder.isTypeSupported('audio/mp4') 
        ? 'audio/mp4' 
        : MediaRecorder.isTypeSupported('audio/ogg') 
        ? 'audio/ogg' 
        : 'audio/webm';
      
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const extension = mimeType.split('/')[1];
        const audioBlob = new Blob(chunks, { type: mimeType });
        const audioFile = new File([audioBlob], `audio-${Date.now()}.${extension}`, { type: mimeType });
        
        // Não envia automaticamente, apenas adiciona ao input
        setPendingAudio(audioFile);
        setNewMessage(`🎤 Áudio gravado`);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error('Erro ao iniciar gravação:', error);
      alert('Erro ao acessar microfone. Verifique as permissões.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  const visibleMessages = useMemo(() => {
    let lastDate = null;
    return messages
      .filter(msg => !searchTerm || (
        msg.text?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.media_transcript?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.media_summary?.toLowerCase().includes(searchTerm.toLowerCase())
      ))
      .map(msg => {
        const current = new Date(msg.created_at);
        const showDate = !lastDate || !isSameDay(lastDate, current);
        lastDate = current;
        return { ...msg, showDate, date: current };
      });
  }, [messages, searchTerm]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-nc-surface">
        <p className="text-nc-text-muted">Carregando mensagens...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-nc-surface min-h-0">
      {showProfile && (
        <CustomerProfilePanel
          conversation={conversation}
          isOpen={showProfile}
          onClose={() => setShowProfile(false)}
          onConversationUpdate={onConversationUpdate}
        />
      )}
      <div ref={topBarRef} className="flex-shrink-0">
        <div className="bg-nc-white border-b border-nc-gray-200 p-3 md:p-4">
        <div className="flex justify-between items-start mb-2 md:mb-3 gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {onBack && (
                <button
                  onClick={onBack}
                  className="md:hidden p-1 -ml-1 text-nc-text-secondary hover:text-nc-text"
                  title="Voltar"
                >
                  ←
                </button>
              )}
              <h2 className="text-base md:text-xl font-bold text-nc-text-title truncate">
                {conversation.client_name || conversation.client_phone}
              </h2>
            </div>
            <p className="text-xs md:text-sm text-nc-text-secondary truncate">{formatPhone(conversation.client_phone)}</p>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
            <div className={`flex items-center gap-1.5 px-2 py-1 md:px-2.5 md:py-1.5 rounded-full text-xs font-medium border ${
              mode === 'bot'
                ? 'bg-nc-gray-100 text-nc-text border-nc-gray-200'
                : 'bg-nc-gray-100 text-nc-text border-nc-gray-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${mode === 'bot' ? 'bg-green-500' : 'bg-nc-yellow'}`}></span>
              <span className="hidden sm:inline">{mode === 'bot' ? 'Bot Ativo' : 'Modo Humano'}</span>
              <span className="sm:hidden">{mode === 'bot' ? 'Bot' : 'Humano'}</span>
            </div>
            {mode === 'bot' ? (
              <button
                onClick={() => setShowPauseMenu(!showPauseMenu)}
                className="nc-btn text-xs px-2 py-1"
                title="Pausar Bot"
              >
                ⏸️ <span className="hidden sm:inline">Pausar</span>
              </button>
            ) : (
              <button
                onClick={handleResumeBot}
                className="nc-btn text-xs px-2 py-1"
                title="Reativar Bot"
              >
                ▶️ <span className="hidden sm:inline">Reativar</span>
              </button>
            )}
          </div>
        </div>

        <div className="relative flex flex-wrap items-center gap-1.5 md:gap-2">
          {!selectionMode ? (
            <button
              onClick={() => setSelectionMode(true)}
              className="nc-btn"
              title="Selecionar mensagens"
            >
              ✓ Selecionar
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedMessages(new Set());
                }}
                className="nc-btn"
                title="Cancelar seleção"
              >
                ✗ Cancelar
              </button>
              {selectedMessages.size > 0 && (
                <button
                  onClick={deleteSelectedMessages}
                  className="nc-btn bg-red-100 text-red-700 border-red-200 hover:bg-red-200"
                  title="Excluir mensagens selecionadas"
                >
                  🗑️ Excluir ({selectedMessages.size})
                </button>
              )}
            </>
          )}
          
          <button
            onClick={() => setActivePanel(activePanel === 'classification' ? '' : 'classification')}
            className={`nc-btn ${activePanel === 'classification' ? 'nc-btn-active' : ''}`}
            title="Classificação Jurídica"
          >
            ⚖️ Classificar
          </button>
          
          <button
            onClick={() => setActivePanel(activePanel === 'reminders' ? '' : 'reminders')}
            className={`nc-btn ${activePanel === 'reminders' ? 'nc-btn-active' : ''}`}
            title="Lembretes"
          >
            ⏰ Lembretes
          </button>
          
          <button
            onClick={() => setActivePanel(activePanel === 'documents' ? '' : 'documents')}
            className={`nc-btn ${activePanel === 'documents' ? 'nc-btn-active' : ''}`}
            title="Gerar Documento"
          >
            � Documentos
          </button>
          
          <button
            onClick={() => setActivePanel(activePanel === 'notes' ? '' : 'notes')}
            className={`nc-btn ${activePanel === 'notes' ? 'nc-btn-active' : ''}`}
            title="Notas Internas"
          >
            📝 Notas
          </button>
          
          <button
            onClick={toggleConfidential}
            disabled={savingConfidential}
            className={`nc-btn ${confidential ? 'nc-btn-active' : ''}`}
            title={confidential ? 'Conversa sigilosa' : 'Marcar como sigilosa'}
          >
            {confidential ? '🔒 Sigiloso' : '🔓 Sigiloso'}
          </button>

          <button
            onClick={() => setShowProfile(!showProfile)}
            className={`nc-btn ${showProfile ? 'nc-btn-active' : ''}`}
            title="Perfil do Cliente"
          >
            👤 Perfil
          </button>

          <button
            onClick={() => setActivePanel(activePanel === 'signatures' ? '' : 'signatures')}
            className={`nc-btn ${activePanel === 'signatures' ? 'nc-btn-active' : ''}`}
            title="Assinatura Eletrônica"
          >
            ✍️ Assinatura
          </button>
          
          {showPauseMenu && (
            <div className="absolute left-0 top-12 bg-nc-white border border-nc-gray-300 rounded-nc shadow-card p-2 z-10 w-48">
              <button onClick={() => handlePauseBot('15')} className="w-full text-left px-3 py-2 text-sm text-nc-text hover:bg-nc-gray-100 rounded transition">⏱️ 15 minutos</button>
              <button onClick={() => handlePauseBot('30')} className="w-full text-left px-3 py-2 text-sm text-nc-text hover:bg-nc-gray-100 rounded transition">⏱️ 30 minutos</button>
              <button onClick={() => handlePauseBot('60')} className="w-full text-left px-3 py-2 text-sm text-nc-text hover:bg-nc-gray-100 rounded transition">⏱️ 1 hora</button>
              <button onClick={() => handlePauseBot('180')} className="w-full text-left px-3 py-2 text-sm text-nc-text hover:bg-nc-gray-100 rounded transition">⏱️ 3 horas</button>
              <button onClick={() => handlePauseBot('1440')} className="w-full text-left px-3 py-2 text-sm text-nc-text hover:bg-nc-gray-100 rounded transition">📅 1 dia</button>
              <button onClick={() => handlePauseBot('forever')} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition">⏹️ Pausar sempre</button>
            </div>
          )}
        </div>
        
        {/* Busca de mensagens */}
        <div className="mt-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar mensagens..."
            className="nc-input"
          />
        </div>
        </div>

      {/* Painel de Classificação Jurídica */}
      {activePanel === 'classification' && (
        <div className="nc-panel p-4 max-h-80 overflow-y-auto">
          <LegalClassification
            conversation={conversation}
            onUpdate={onConversationUpdate}
          />
        </div>
      )}

      {/* Painel de Lembretes */}
      {activePanel === 'reminders' && (
        <div className="nc-panel p-4 max-h-80 overflow-y-auto">
          <RemindersPanel conversation={conversation} />
        </div>
      )}

      {/* Painel de Documentos */}
      {activePanel === 'documents' && (
        <div className="nc-panel p-4 max-h-80 overflow-y-auto">
          <DocumentGenerator conversation={conversation} />
        </div>
      )}

      {/* Painel de Notas Internas */}
      {activePanel === 'notes' && (
        <div className="bg-nc-gray-100 border-b border-nc-gray-200 p-4 max-h-80 overflow-y-auto">
          <h3 className="text-sm font-bold text-nc-text-title mb-2">📝 Notas Internas</h3>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            placeholder="Anotações internas sobre o cliente/caso..."
            className="nc-input resize-none"
            rows="4"
          />
          <button
            onClick={saveNotes}
            disabled={savingNotes}
            className="mt-2 nc-btn-primary disabled:opacity-50"
          >
            {savingNotes ? 'Salvando...' : 'Salvar notas'}
          </button>
        </div>
      )}

      {/* Painel de Assinatura Eletrônica */}
      {activePanel === 'signatures' && (
        <div className="nc-panel p-4 max-h-80 overflow-y-auto">
          <SignaturePanel conversationId={conversation?.id} />
        </div>
      )}
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={() => {
          if (!scrollContainerRef.current) return;
          const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
          isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 80;
          handleScroll();
        }}
        className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 relative"
      >
        {visibleMessages.map((msg) => (
          <div
            key={msg.id}
            className="flex flex-col"
          >
            {msg.showDate && (
              <div className="flex justify-center my-2">
                <span className="text-xs px-3 py-1 rounded-full bg-nc-gray-200 text-nc-text-secondary">
                  {formatDateLabel(msg.date)}
                </span>
              </div>
            )}
            <div
              className={`flex items-start gap-2 ${
                msg.direction === 'inbound' ? 'justify-start' : 'justify-end'
              }`}
            >
            {selectionMode && (
              <input
                type="checkbox"
                checked={selectedMessages.has(msg.id)}
                onChange={() => toggleMessageSelection(msg.id)}
                className="mt-2 w-4 h-4 cursor-pointer"
              />
            )}
            <div
              className={`max-w-md px-4 py-2.5 rounded-nc shadow-soft ${
                msg.direction === 'inbound'
                  ? 'bg-nc-gray-150 text-nc-text'
                  : msg.sender_type === 'bot'
                  ? 'bg-nc-white text-nc-text border border-nc-gray-300'
                  : 'bg-nc-yellow-50 text-nc-text border border-nc-yellow-200'
              }`}
            >
              {/* Renderizar mídia se existir */}
              {msg.media_url && (
                <div className="mb-2">
                  {msg.content_type === 'image' || msg.media_type?.startsWith('image/') || msg.media_url?.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)(\?.*)?$/) ? (
                    <img
                      src={msg.media_url}
                      alt="Imagem"
                      className="max-w-40 max-h-40 object-cover rounded cursor-pointer hover:opacity-90 border border-nc-gray-200"
                      onClick={() => setExpandedMedia(msg.media_url)}
                    />
                  ) : msg.content_type === 'audio' || msg.media_type?.startsWith('audio/') ? (
                    msg.status === 'failed' || msg.media_status === 'failed' ? (
                      <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                        ❌ Áudio não disponível (falha no envio)
                      </div>
                    ) : (
                      <audio 
                        controls 
                        className="w-full" 
                        src={msg.media_url}
                        onError={(e) => {
                          console.warn('[CHAT] Erro ao carregar áudio:', msg.media_url);
                          e.target.style.display = 'none';
                          e.target.parentElement.innerHTML = '<div class="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">⚠️ Erro ao carregar áudio</div>';
                        }}
                      >
                        Seu navegador não suporta áudio.
                      </audio>
                    )
                  ) : msg.content_type === 'document' || msg.media_type === 'application/pdf' || msg.media_url?.toLowerCase().match(/\.pdf(\?.*)?$/) ? (
                    <div className="w-full rounded border border-nc-gray-200 overflow-hidden bg-nc-gray-50 p-2">
                      <object
                        data={msg.media_url}
                        type="application/pdf"
                        className="w-full h-40 rounded bg-white"
                      >
                        <p className="text-xs text-nc-text p-2">Pré-visualização indisponível.</p>
                      </object>
                      <div className="flex items-center gap-3 mt-2">
                        <button
                          onClick={() => setExpandedMedia(msg.media_url)}
                          className="inline-flex items-center gap-1 text-sm text-nc-text hover:text-nc-yellow transition"
                        >
                          👁 Ver
                        </button>
                        <a
                          href={msg.media_url}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-nc-text hover:text-nc-yellow hover:underline transition"
                        >
                          ⬇ Baixar
                        </a>
                      </div>
                    </div>
                  ) : (
                    <a
                      href={msg.media_url}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-nc-text hover:text-nc-yellow hover:underline transition"
                    >
                      📎 {msg.text || 'Baixar arquivo'}
                    </a>
                  )}
                </div>
              )}
              
              <p className="text-sm text-nc-text leading-relaxed">{msg.text}</p>

              {/* Status e resumo de mídia (apenas para mídias recebidas) */}
              {(msg.direction === 'inbound') && (msg.content_type === 'audio' || msg.content_type === 'video' || msg.content_type === 'image' || msg.content_type === 'document') && (
                <div className="mt-2 pt-2 border-t border-nc-gray-200/50">
                  {msg.media_status === 'pending' && (
                    <span className="text-xs text-nc-text-muted flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-nc-yellow animate-pulse"></span>
                      Processando {msg.content_type === 'audio' ? 'áudio' : msg.content_type === 'video' ? 'vídeo' : 'mídia'}...
                    </span>
                  )}
                  {msg.media_status === 'failed' && (
                    <span className="text-xs text-red-500 flex items-center gap-1">
                      ❌ Falha no processamento
                    </span>
                  )}
                  {msg.media_status === 'processed' && msg.media_summary && (
                    <p className="text-xs text-nc-text-secondary bg-nc-yellow-50/50 p-1.5 rounded mt-1">
                      📝 {msg.media_summary}
                    </p>
                  )}
                  {msg.media_status === 'processed' && msg.media_transcript && (
                    <button
                      onClick={() => setExpandedTranscript(expandedTranscript === msg.id ? null : msg.id)}
                      className="text-xs text-nc-yellow hover:text-nc-yellow-700 font-medium mt-1 transition"
                    >
                      {expandedTranscript === msg.id ? 'Ocultar transcrição' : 'Ver transcrição'}
                    </button>
                  )}
                  {expandedTranscript === msg.id && msg.media_transcript && (
                    <div className="mt-1.5 p-2 bg-nc-gray-100 rounded text-xs text-nc-text max-h-48 overflow-y-auto">
                      {msg.media_transcript}
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex items-center justify-between mt-1.5 gap-2">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-nc-text-muted">
                    {new Date(msg.created_at).toLocaleTimeString('pt-BR')}
                  </p>
                  {msg.direction === 'outbound' && (
                    <span
                      className={`text-[10px] font-medium flex items-center gap-0.5 ${
                        msg.status === 'failed'
                          ? 'text-red-600'
                          : msg.status === 'read'
                          ? 'text-green-600'
                          : msg.status === 'delivered'
                          ? 'text-blue-600'
                          : 'text-nc-text-muted'
                      }`}
                      title={
                        msg.status === 'failed'
                          ? `Falha na entrega: ${msg.error_info?.title || 'Erro desconhecido'} - ${msg.error_info?.message || ''}`
                          : msg.status === 'read'
                          ? 'Mensagem lida'
                          : msg.status === 'delivered'
                          ? 'Mensagem entregue'
                          : msg.wa_message_id
                          ? 'Mensagem enviada para o WhatsApp'
                          : 'Enviando mensagem...'
                      }
                    >
                      {msg.status === 'failed' && '❌ Não entregue'}
                      {msg.status === 'read' && '✓✓ Lida'}
                      {msg.status === 'delivered' && '✓✓ Entregue'}
                      {msg.status === 'sent' && '✓ Enviado'}
                      {msg.status === 'pending' && '⏳ Enviando...'}
                      {!msg.status && msg.wa_message_id && '✓ Enviado'}
                      {!msg.status && !msg.wa_message_id && '⏳ Enviando...'}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  {msg.text && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(msg.text);
                        alert('Mensagem copiada!');
                      }}
                      className="text-xs text-nc-text-muted hover:text-nc-text transition"
                      title="Copiar mensagem"
                    >
                      📋
                    </button>
                  )}
                  {msg.media_url && (
                    <a 
                      href={msg.media_url} 
                      download 
                      className="text-xs text-nc-text-muted hover:text-nc-text transition"
                      title="Baixar"
                    >
                      ⬇️
                    </a>
                  )}
                </div>
              </div>
              
              {msg.sender_type === 'bot' && (
                <p className="text-[10px] font-semibold uppercase tracking-wide mt-1.5 text-nc-text-muted">🤖 Bot</p>
              )}
              {msg.sender_type === 'human' && (
                <p className="text-[10px] font-semibold uppercase tracking-wide mt-1.5 text-nc-text-muted">👤 Você</p>
              )}
            </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />

        {/* Botão flutuante: Ir ao final */}
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-20 right-4 w-10 h-10 bg-nc-white/90 backdrop-blur-sm text-nc-text-secondary border border-nc-gray-300 rounded-full shadow-sm hover:bg-nc-white hover:text-nc-text transition z-10 flex items-center justify-center"
            title="Ir ao final"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        )}
      </div>

      {/* Overlay de mídia expandida */}
      {expandedMedia && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
          onClick={() => setExpandedMedia(null)}
        >
          <div
            className="relative w-full max-w-6xl h-[90vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {expandedMedia.toLowerCase().match(/\.pdf(\?.*)?$/) ? (
              <object
                data={expandedMedia}
                type="application/pdf"
                className="w-full h-full rounded bg-white shadow-lg"
              >
                <p className="text-white p-4">Não foi possível exibir o PDF.</p>
              </object>
            ) : (
              <img
                src={expandedMedia}
                alt="Mídia expandida"
                className="max-w-full max-h-full rounded shadow-lg object-contain"
              />
            )}
          </div>
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {expandedMedia.toLowerCase().match(/\.pdf(\?.*)?$/) && (
              <a
                href={expandedMedia}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-nc-black bg-nc-yellow-200 hover:bg-nc-yellow-300 px-3 py-1.5 rounded"
                onClick={(e) => e.stopPropagation()}
              >
                ⬇ Baixar
              </a>
            )}
            <button
              onClick={() => setExpandedMedia(null)}
              className="text-white text-2xl hover:text-nc-yellow p-1"
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="bg-nc-white border-t border-nc-gray-200 p-4">
        <div className="relative">
          {showEmojiPicker && (
            <div className="absolute bottom-16 left-0 bg-nc-white border border-nc-gray-300 rounded-nc shadow-card p-3 z-10 max-h-80 overflow-y-auto w-96">
              <div className="grid grid-cols-8 gap-1">
                {emojis.map((emoji, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setNewMessage(newMessage + emoji);
                      setShowEmojiPicker(false);
                    }}
                    className="text-2xl hover:bg-nc-gray-100 p-2 rounded transition"
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Preview de arquivo pendente */}
          {(pendingFile || pendingAudio) && (
            <div className="mb-2 flex items-center justify-between gap-2 bg-nc-yellow-50 border border-nc-yellow-200 rounded-nc p-2">
              <span className="text-sm text-nc-text truncate">
                {pendingAudio ? '🎤 Áudio gravado' : `📎 ${pendingFile?.name}`}
              </span>
              <button
                onClick={removePendingFile}
                className="text-nc-text-muted hover:text-red-600 transition"
                title="Remover"
              >
                ❌
              </button>
            </div>
          )}

          <div className="flex gap-2 items-end bg-nc-gray-100 rounded-nc p-2 border border-nc-gray-200 focus-within:border-nc-yellow focus-within:ring-1 focus-within:ring-nc-yellow transition-all">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-2 text-nc-text-secondary hover:text-nc-yellow hover:bg-nc-white rounded-nc transition"
              title="Emojis"
            >
              😊
            </button>
            
            <label className="p-2 text-nc-text-secondary hover:text-nc-yellow hover:bg-nc-white rounded-nc transition cursor-pointer" title="Enviar arquivo">
              📎
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.txt,.mp3,.mp4,.mpeg,.3gp,.webm,.ogg"
                onChange={handleFileSelect}
              />
            </label>
            
            <button
              className={`p-2 rounded-nc transition ${
                isRecording 
                  ? 'bg-red-500 text-white' 
                  : 'text-nc-text-secondary hover:text-nc-yellow hover:bg-nc-white'
              }`}
              title={isRecording ? 'Parar gravação' : 'Gravar áudio'}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={sending}
            >
              {isRecording ? '⏹️' : '🎤'}
            </button>
            
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSendMessage();
                }
              }}
              placeholder="Digite sua resposta... (Shift+Enter para quebrar linha)"
              className="flex-1 bg-transparent text-nc-text placeholder-nc-text-placeholder resize-none min-h-[40px] max-h-32 outline-none px-1"
              rows="1"
              disabled={sending}
              style={{ height: 'auto' }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
            />
            <div className="flex flex-col gap-1 justify-end">
              <button
                onClick={handleSendMessage}
                disabled={sending || (!newMessage.trim() && !pendingFile && !pendingAudio)}
                className="nc-btn-primary h-[40px] disabled:opacity-50"
              >
                {sending ? 'Enviando...' : 'Enviar'}
              </button>
              {newMessage && (
                <span className="text-xs text-nc-text-muted text-center">
                  {newMessage.length} caracteres
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
