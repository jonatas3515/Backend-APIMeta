import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import axios from 'axios';

export default function ChatWindow({ conversation, onConversationUpdate }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
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

    return () => {
      subscription.unsubscribe();
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
      
      // Se tem arquivo ou áudio pendente, fazer upload DIRETO para Supabase Storage
      const fileToUpload = pendingAudio || pendingFile;
      if (fileToUpload) {
        const timestamp = Date.now();
        const sanitizedFileName = fileToUpload.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${conversation.id}/${timestamp}-${sanitizedFileName}`;

        // Upload direto para Supabase Storage (sem passar pelo Next.js)
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('chat-files')
          .upload(filePath, fileToUpload, {
            contentType: fileToUpload.type,
            upsert: false
          });

        if (uploadError) {
          console.error('Erro no upload:', uploadError);
          throw new Error('Erro ao fazer upload do arquivo');
        }

        // Obter URL pública
        const { data: urlData } = supabase.storage
          .from('chat-files')
          .getPublicUrl(filePath);

        mediaUrl = urlData.publicUrl;
        mediaType = fileToUpload.type;
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
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Carregando mensagens...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {conversation.client_name || conversation.client_phone}
            </h2>
            <p className="text-sm text-gray-500">{conversation.client_phone}</p>
          </div>
        <div className="relative flex gap-2">
          <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
            mode === 'bot'
              ? 'bg-green-100 text-green-800'
              : 'bg-yellow-100 text-yellow-800'
          }`}>
            {mode === 'bot' ? '🤖 Bot Ativo' : '👤 Modo Humano'}
          </div>
          
          {mode === 'bot' ? (
            <button
              onClick={() => setShowPauseMenu(!showPauseMenu)}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg font-semibold hover:bg-yellow-600 transition"
            >
              ⏸️ Pausar Bot
            </button>
          ) : (
            <button
              onClick={handleResumeBot}
              className="px-4 py-2 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition"
            >
              ▶️ Reativar Bot
            </button>
          )}
          
          {showPauseMenu && (
            <div className="absolute right-0 top-12 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-10 w-48">
              <button onClick={() => handlePauseBot('15')} className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded">⏱️ 15 minutos</button>
              <button onClick={() => handlePauseBot('30')} className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded">⏱️ 30 minutos</button>
              <button onClick={() => handlePauseBot('60')} className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded">⏱️ 1 hora</button>
              <button onClick={() => handlePauseBot('180')} className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded">⏱️ 3 horas</button>
              <button onClick={() => handlePauseBot('1440')} className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded">📅 1 dia</button>
              <button onClick={() => handlePauseBot('forever')} className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-red-600">⏹️ Pausar sempre</button>
            </div>
          )}
        </div>
        </div>
        
        {/* Busca de mensagens */}
        <div className="mt-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="🔍 Buscar mensagens..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

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
              className={`max-w-md px-4 py-2 rounded-lg ${
                msg.direction === 'inbound'
                  ? 'bg-gray-200 text-gray-900'
                  : msg.sender_type === 'bot'
                  ? 'bg-blue-100 text-blue-900'
                  : 'bg-green-100 text-green-900'
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
                      className="flex items-center gap-2 text-blue-600 hover:underline"
                    >
                      📎 {msg.text || 'Baixar arquivo'}
                    </a>
                  )}
                </div>
              )}
              
              <p className="text-sm">{msg.text}</p>
              
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs opacity-70">
                  {new Date(msg.created_at).toLocaleTimeString('pt-BR')}
                </p>
                {msg.media_url && (
                  <a 
                    href={msg.media_url} 
                    download 
                    className="text-xs text-blue-600 hover:underline ml-2"
                    title="Baixar"
                  >
                    ⬇️
                  </a>
                )}
              </div>
              
              {msg.sender_type === 'bot' && (
                <p className="text-xs font-semibold mt-1">🤖 Bot</p>
              )}
              {msg.sender_type === 'human' && (
                <p className="text-xs font-semibold mt-1">👤 Você</p>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-white border-t border-gray-200 p-4">
        <div className="relative">
          {showEmojiPicker && (
            <div className="absolute bottom-16 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-10 max-h-80 overflow-y-auto w-96">
              <div className="grid grid-cols-8 gap-1">
                {emojis.map((emoji, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setNewMessage(newMessage + emoji);
                      setShowEmojiPicker(false);
                    }}
                    className="text-2xl hover:bg-gray-100 p-2 rounded transition"
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
            <div className="mb-2 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-2">
              <span className="text-sm text-blue-900">
                {pendingAudio ? '🎤 Áudio gravado' : `📎 ${pendingFile?.name}`}
              </span>
              <button
                onClick={removePendingFile}
                className="text-red-600 hover:text-red-800 font-bold"
                title="Remover"
              >
                ❌
              </button>
            </div>
          )}

          <div className="flex gap-2 items-end">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
              title="Emojis"
            >
              😊
            </button>
            
            <label className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition cursor-pointer" title="Enviar arquivo">
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
              className={`px-3 py-2 rounded-lg transition ${
                isRecording 
                  ? 'bg-red-500 text-white animate-pulse' 
                  : 'text-gray-600 hover:bg-gray-100'
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
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-[42px] max-h-32"
              rows="1"
              disabled={sending}
              style={{ height: 'auto' }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={sending || (!newMessage.trim() && !pendingFile && !pendingAudio)}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 disabled:bg-gray-300 transition"
            >
              {sending ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
