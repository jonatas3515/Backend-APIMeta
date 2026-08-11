import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import axios from 'axios';
import LegalClassification from './LegalClassification';
import RemindersPanel from './RemindersPanel';
import DocumentGenerator from './DocumentGenerator';

export default function ChatWindow({ conversation, onConversationUpdate }) {
  const [showClassification, setShowClassification] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
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
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingAudio, setPendingAudio] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const messagesEndRef = useRef(null);

  // Sincroniza o mode local com a conversa atual
  useEffect(() => {
    setMode(conversation.mode);
  }, [conversation.id, conversation.mode]);
  const fileInputRef = useRef(null);
  
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        const { data: signedData } = await axios.post('/api/upload-file', {
          fileName: fileToUpload.name,
          fileType: fileToUpload.type,
          conversationId: conversation.id
        });

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
      await axios.post('/api/send-message', {
        conversation_id: conversation.id,
        text: newMessage,
        media_url: mediaUrl,
        media_type: mediaType
      });

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
      await axios.post('/api/automation-control', {
        conversationId: conversation.id,
        action: 'pause',
        duration
      });
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
      await axios.post('/api/automation-control', {
        conversationId: conversation.id,
        action: 'resume'
      });
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-nc-surface">
        <p className="text-nc-text-muted">Carregando mensagens...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-nc-surface">
      <div className="bg-nc-white border-b border-nc-gray-200 p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h2 className="text-xl font-bold text-nc-text-title">
              {conversation.client_name || conversation.client_phone}
            </h2>
            <p className="text-sm text-nc-text-secondary">{conversation.client_phone}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border ${
              mode === 'bot'
                ? 'bg-nc-gray-100 text-nc-text border-nc-gray-200'
                : 'bg-nc-gray-100 text-nc-text border-nc-gray-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${mode === 'bot' ? 'bg-green-500' : 'bg-nc-yellow'}`}></span>
              {mode === 'bot' ? 'Bot Ativo' : 'Modo Humano'}
            </div>
            {mode === 'bot' ? (
              <button
                onClick={() => setShowPauseMenu(!showPauseMenu)}
                className="nc-btn"
                title="Pausar Bot"
              >
                ⏸️ Pausar
              </button>
            ) : (
              <button
                onClick={handleResumeBot}
                className="nc-btn"
                title="Reativar Bot"
              >
                ▶️ Reativar
              </button>
            )}
          </div>
        </div>

        <div className="relative flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowClassification(!showClassification)}
            className={`nc-btn ${showClassification ? 'nc-btn-active' : ''}`}
            title="Classificação Jurídica"
          >
            � Classificar
          </button>
          
          <button
            onClick={() => setShowReminders(!showReminders)}
            className={`nc-btn ${showReminders ? 'nc-btn-active' : ''}`}
            title="Lembretes"
          >
            ⏰ Lembretes
          </button>
          
          <button
            onClick={() => setShowDocuments(!showDocuments)}
            className={`nc-btn ${showDocuments ? 'nc-btn-active' : ''}`}
            title="Gerar Documento"
          >
            � Documentos
          </button>
          
          <button
            onClick={() => setShowNotes(!showNotes)}
            className={`nc-btn ${showNotes ? 'nc-btn-active' : ''}`}
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
      {showClassification && (
        <div className="nc-panel p-4">
          <LegalClassification 
            conversation={conversation} 
            onUpdate={onConversationUpdate}
          />
        </div>
      )}

      {/* Painel de Lembretes */}
      {showReminders && (
        <div className="nc-panel p-4">
          <RemindersPanel conversation={conversation} />
        </div>
      )}

      {/* Painel de Documentos */}
      {showDocuments && (
        <div className="nc-panel p-4">
          <DocumentGenerator conversation={conversation} />
        </div>
      )}

      {/* Painel de Notas Internas */}
      {showNotes && (
        <div className="bg-nc-gray-100 border-b border-nc-gray-200 p-4">
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

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages
          .filter(msg => !searchTerm || msg.text?.toLowerCase().includes(searchTerm.toLowerCase()))
          .map((msg) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.direction === 'inbound' ? 'justify-start' : 'justify-end'
            }`}
          >
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
                  {msg.media_type?.startsWith('image/') ? (
                    <img 
                      src={msg.media_url} 
                      alt="Imagem" 
                      className="max-w-full rounded cursor-pointer hover:opacity-90"
                      onClick={() => window.open(msg.media_url, '_blank')}
                    />
                  ) : msg.media_type?.startsWith('audio/') ? (
                    <audio controls className="w-full">
                      <source src={msg.media_url} type={msg.media_type} />
                      Seu navegador não suporta áudio.
                    </audio>
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
              
              <div className="flex items-center justify-between mt-1.5 gap-2">
                <p className="text-xs text-nc-text-muted">
                  {new Date(msg.created_at).toLocaleTimeString('pt-BR')}
                </p>
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
        ))}
        <div ref={messagesEndRef} />
      </div>

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
