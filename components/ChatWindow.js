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
  const messagesEndRef = useRef(null);
  
  const emojis = [
    '😊', '😃', '😄', '😁', '😆', '😅', '🤣', '�', '🙂', '🙃',
    '😉', '�😊', '�', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
    '�👍', '👎', '👌', '✌️', '🤞', '🤝', '👏', '🙌', '👐', '🤲',
    '❤️', '🧡', '�', '💚', '💙', '�', '�', '🤍', '🤎', '💔',
    '⚖️', '📄', '📝', '💼', '📁', '📂', '🗂️', '📋', '📊', '📈',
    '✅', '❌', '⭐', '🎯', '💯', '🔥', '💪', '🙏', '👀', '🤔'
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
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      await axios.post('/api/send-message', {
        conversation_id: conversation.id,
        text: newMessage,
      });

      setNewMessage('');
      onConversationUpdate();
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

  const handleFileUpload = async (file) => {
    if (!file) return;

    setSending(true);
    try {
      // Converter arquivo para base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      reader.onload = async () => {
        try {
          const fileBase64 = reader.result;

          const uploadResponse = await axios.post('/api/upload-file', {
            fileBase64,
            fileName: file.name,
            fileType: file.type,
            conversationId: conversation.id
          });

          const { url, fileName, fileType } = uploadResponse.data;

          // Enviar mensagem com o arquivo
          await axios.post('/api/send-message', {
            conversation_id: conversation.id,
            text: `📎 ${fileName}`,
            media_url: url,
            media_type: fileType
          });

          onConversationUpdate();
          setSending(false);
        } catch (error) {
          console.error('Erro ao enviar arquivo:', error);
          alert('Erro ao enviar arquivo: ' + error.message);
          setSending(false);
        }
      };

      reader.onerror = () => {
        console.error('Erro ao ler arquivo');
        alert('Erro ao ler arquivo');
        setSending(false);
      };
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      alert('Erro ao processar arquivo');
      setSending(false);
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
        await handleFileUpload(audioFile);
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
      <div className="bg-white border-b border-gray-200 p-4 flex justify-between items-center">
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

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.direction === 'inbound' ? 'justify-start' : 'justify-end'
            }`}
          >
            <div
              className={`max-w-xs px-4 py-2 rounded-lg ${
                msg.direction === 'inbound'
                  ? 'bg-gray-200 text-gray-900'
                  : msg.sender_type === 'bot'
                  ? 'bg-blue-100 text-blue-900'
                  : 'bg-green-100 text-green-900'
              }`}
            >
              <p className="text-sm">{msg.text}</p>
              <p className="text-xs mt-1 opacity-70">
                {new Date(msg.created_at).toLocaleTimeString('pt-BR')}
              </p>
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
            <div className="absolute bottom-16 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-10 max-h-64 overflow-y-auto">
              <div className="grid grid-cols-10 gap-1">
                {emojis.map((emoji, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setNewMessage(newMessage + emoji);
                      setShowEmojiPicker(false);
                    }}
                    className="text-xl hover:bg-gray-100 p-1 rounded"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex gap-2 items-center">
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
                type="file"
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.txt"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    handleFileUpload(file);
                    e.target.value = '';
                  }
                }}
                disabled={sending}
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
            
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Digite sua resposta..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={sending}
            />
            <button
              onClick={handleSendMessage}
              disabled={sending || !newMessage.trim()}
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
