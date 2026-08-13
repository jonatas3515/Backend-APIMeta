import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { uploadMediaToWhatsApp, sendWhatsAppMediaMessage } from '@/lib/whatsapp';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { conversation_id, text, media_url, media_type } = req.body;
    const userRole = req.user?.role;
    const userId = req.user?.id;

    if (!conversation_id || !text) {
      return res.status(400).json({ error: 'conversation_id e text são obrigatórios' });
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('client_phone, assigned_user_id')
      .eq('id', conversation_id)
      .single();

    if (convError) {
      console.error('[SEND-MESSAGE] Erro ao buscar conversa:', convError);
      return res.status(500).json({ error: 'Erro ao buscar conversa: ' + convError.message });
    }

    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Verificar permissão de acesso
    // Admin e Advogado podem acessar todas as conversas
    // Estagiário só pode acessar conversas atribuídas a ele
    if (userRole === 'estagiario' && conversation.assigned_user_id !== userId) {
      return res.status(403).json({ error: 'Você não tem permissão para enviar mensagens nesta conversa' });
    }

    // Se tem mídia, faz upload para o servidor da Meta e envia por media_id
    let contentType = 'text';
    let waMessageId = null;

    if (media_url) {
      contentType = media_type?.startsWith('audio/') ? 'audio' 
        : media_type?.startsWith('image/') ? 'image'
        : media_type?.startsWith('video/') ? 'video'
        : 'document';

      try {
        console.log('[SEND-MESSAGE] Baixando mídia do Supabase:', media_url);
        const mediaResponse = await axios.get(media_url, { responseType: 'arraybuffer' });
        const fileBuffer = Buffer.from(mediaResponse.data);
        console.log('[SEND-MESSAGE] Mídia baixada:', fileBuffer.length, 'bytes');

        console.log('[SEND-MESSAGE] Fazendo upload para Meta:', contentType, media_type);
        const mediaId = await uploadMediaToWhatsApp(fileBuffer, media_type);

        console.log('[SEND-MESSAGE] Enviando mídia por media_id:', mediaId);
        await sendWhatsAppMediaMessage(conversation.client_phone, mediaId, contentType, text);

        waMessageId = mediaId;
      } catch (mediaError) {
        console.error('[SEND-MESSAGE] ❌ Erro ao enviar mídia:', mediaError.message);
        return res.status(500).json({ 
          error: 'Erro ao enviar mídia: ' + mediaError.message,
          details: mediaError.response?.data || mediaError.toString()
        });
      }
    } else {
      // Envia mensagem de texto
      const { sendWhatsAppMessage } = await import('@/lib/whatsapp');
      waMessageId = await sendWhatsAppMessage(conversation.client_phone, text);
    }

    const { error: msgError } = await supabase
      .from('messages')
      .insert([{
        conversation_id,
        direction: 'outbound',
        sender_type: 'human',
        content_type: contentType,
        text,
        media_url: media_url || null,
        media_type: media_type || null,
        wa_message_id: waMessageId || null
      }]);

    if (msgError) {
      console.error('Erro ao salvar mensagem:', msgError);
    }

    res.json({ 
      success: true, 
      message: 'Mensagem enviada com sucesso',
      wa_message_id: waMessageId || null
    });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: error.message });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
