import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { sanitizeError } from '@/lib/webhookLog';
import { convertAudioToOgg } from '@/lib/audio';
import { uploadMediaToWhatsApp, sendWhatsAppMediaMessage } from '@/lib/whatsapp';
import { safeLog, safeError } from '@/lib/safeLogger';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabase = createClient(
  SUPABASE_URL,
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
      safeError('send_message_fetch_conversation', convError, {
        requestId: conversation_id,
        route: '/api/send-message'
      });
      return res.status(500).json({ error: 'Erro ao buscar conversa' });
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
        safeLog('info', 'send_message_media_download', {
          requestId: conversation_id,
          contentType,
          route: '/api/send-message'
        });
        const mediaResponse = await axios.get(media_url, { responseType: 'arraybuffer' });
        let fileBuffer = Buffer.from(mediaResponse.data);
        let uploadMime = media_type;
        safeLog('info', 'send_message_media_downloaded', {
          requestId: conversation_id,
          payloadSize: fileBuffer.length,
          contentType,
          route: '/api/send-message'
        });

        if (contentType === 'audio') {
          try {
            safeLog('info', 'send_message_audio_convert', {
              requestId: conversation_id,
              route: '/api/send-message'
            });
            const converted = await convertAudioToOgg(fileBuffer, media_type);
            if (converted) {
              fileBuffer = converted.buffer;
              uploadMime = converted.mime;
              safeLog('info', 'send_message_audio_converted', {
                requestId: conversation_id,
                payloadSize: fileBuffer.length,
                route: '/api/send-message'
              });
            }
          } catch (convertError) {
            safeError('send_message_audio_convert_failed', convertError, {
              requestId: conversation_id,
              route: '/api/send-message'
            });
          }
        }

        safeLog('info', 'send_message_media_upload', {
          requestId: conversation_id,
          contentType,
          mediaType: uploadMime,
          route: '/api/send-message'
        });
        const mediaId = await uploadMediaToWhatsApp(fileBuffer, uploadMime);

        safeLog('info', 'send_message_media_send', {
          requestId: conversation_id,
          contentType,
          route: '/api/send-message'
        });
        waMessageId = await sendWhatsAppMediaMessage(conversation.client_phone, mediaId, contentType, text);
      } catch (mediaError) {
        safeError('send_message_media_failed', mediaError, {
          requestId: conversation_id,
          route: '/api/send-message'
        });
        return res.status(500).json({ 
          error: 'Erro ao enviar mídia'
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
        wa_message_id: waMessageId || null,
        media_status: media_url ? 'processed' : null,
        status: 'sent'
      }]);

    if (msgError) {
      safeError('send_message_save_failed', msgError, {
        requestId: conversation_id,
        route: '/api/send-message'
      });
    }

    res.json({ 
      success: true, 
      message: 'Mensagem enviada com sucesso',
      wa_message_id: waMessageId || null
    });
  } catch (error) {
    safeError('send_message_failed', error, {
      route: '/api/send-message'
    });
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
