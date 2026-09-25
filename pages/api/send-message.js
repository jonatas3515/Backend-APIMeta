import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { sanitizeError, hashIdentifier } from '@/lib/webhookLog';
import { convertAudioToOgg } from '@/lib/audio';
import { uploadMediaToWhatsApp, sendWhatsAppMediaMessage } from '@/lib/whatsapp';
import { resolveMediaKind, normalizeWhatsAppMime, MEDIA_MAX_BYTES } from '@/lib/mediaKind';
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
    const { conversation_id, text, media_url, media_type, filename } = req.body;
    const userRole = req.user?.role;
    const userId = req.user?.id;

    if (!conversation_id || (!text && !media_url)) {
      return res.status(400).json({ error: 'conversation_id é obrigatório; informe text ou media_url' });
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
    let mediaId = null;
    let messageText = text || '';

    if (media_url) {
      contentType = resolveMediaKind(media_type, filename);

      try {
        safeLog('info', 'media_file_received', {
          requestId: conversation_id,
          media_kind: contentType,
          media_mime: media_type || null,
          media_extension: filename ? filename.split('.').pop().toLowerCase() : null,
          route: '/api/send-message'
        });
        const mediaResponse = await axios.get(media_url, { responseType: 'arraybuffer' });
        let fileBuffer = Buffer.from(mediaResponse.data);
        safeLog('info', 'send_message_media_downloaded', {
          requestId: conversation_id,
          media_kind: contentType,
          media_size_bytes: fileBuffer.length,
          route: '/api/send-message'
        });

        // Limite da Meta Cloud API por tipo — falha rápida com motivo compreensível
        const maxBytes = MEDIA_MAX_BYTES[contentType];
        if (maxBytes && fileBuffer.length > maxBytes) {
          safeLog('info', 'media_failure', {
            requestId: conversation_id,
            media_kind: contentType,
            media_size_bytes: fileBuffer.length,
            media_failure_reason: 'media_too_large',
            route: '/api/send-message'
          });
          return res.status(400).json({
            error: 'Arquivo excede o limite permitido para este tipo de mídia',
            reason: 'media_too_large'
          });
        }

        // Vídeo fora de mp4/3gpp não é aceito pela Meta — falha rápida e clara.
        // Áudio segue o fluxo já existente (conversão AMR tentada antes do upload).
        let uploadMime = media_type;
        if (contentType === 'video') {
          uploadMime = normalizeWhatsAppMime('video', media_type, filename);
          if (uploadMime == null) {
            safeLog('info', 'media_failure', {
              requestId: conversation_id,
              media_kind: contentType,
              media_mime: media_type || null,
              media_failure_reason: 'unsupported_video_format',
              route: '/api/send-message'
            });
            return res.status(400).json({
              error: 'Formato de vídeo não suportado pelo WhatsApp',
              reason: 'unsupported_video_format'
            });
          }
        }
        if (!uploadMime) {
          uploadMime = contentType === 'image' ? 'image/jpeg' : 'application/octet-stream';
        }

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
                media_size_bytes: fileBuffer.length,
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

        safeLog('info', 'whatsapp_media_upload_start', {
          requestId: conversation_id,
          media_kind: contentType,
          media_mime: uploadMime,
          route: '/api/send-message'
        });
        mediaId = await uploadMediaToWhatsApp(fileBuffer, uploadMime);
        safeLog('info', 'whatsapp_media_upload_status', {
          requestId: conversation_id,
          media_kind: contentType,
          upload_status: 'ok',
          route: '/api/send-message'
        });

        const mediaFilename = contentType === 'document' ? (filename || text || 'arquivo') : undefined;
        messageText = contentType === 'document' ? (text || mediaFilename) : (text || '');
        waMessageId = await sendWhatsAppMediaMessage(conversation.client_phone, mediaId, contentType, text, mediaFilename);
        safeLog('info', 'whatsapp_send_status', {
          requestId: conversation_id,
          media_kind: contentType,
          whatsapp_send_status: 'ok',
          route: '/api/send-message'
        });
      } catch (mediaError) {
        // Classifica a etapa da falha. lib/whatsapp lança Error com prefixo
        // próprio quando a Meta respondeu; falha de rede/timeout propaga o
        // erro original do fetch (sem prefixo) — aí o resultado é incerto.
        const msg = mediaError.message || '';
        let stageReason;
        let httpStatus = 500;
        let userMessage;
        if (mediaId) {
          if (/Erro ao enviar m[ií]dia WhatsApp: \d{3}/.test(msg)) {
            stageReason = 'send_rejected';
            userMessage = 'A Meta rejeitou o envio da mídia';
          } else {
            // Timeout/rede sem resposta: a mensagem pode ter sido entregue
            stageReason = 'send_unconfirmed';
            httpStatus = 504;
            userMessage = 'Não foi possível confirmar o envio. Verifique no WhatsApp/conversa antes de tentar novamente.';
          }
        } else {
          stageReason = /Erro ao fazer upload de m[ií]dia: \d{3}/.test(msg)
            ? 'upload_rejected'
            : 'upload_failed';
          userMessage = 'Erro ao enviar mídia';
        }
        safeError('send_message_media_failed', mediaError, {
          requestId: conversation_id,
          media_kind: contentType,
          media_failure_reason: stageReason,
          route: '/api/send-message'
        });
        return res.status(httpStatus).json({
          error: userMessage,
          reason: stageReason
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
        text: messageText,
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

    safeLog('info', 'outbound_message_persisted', {
      requestId: conversation_id,
      conversation_id_hash: hashIdentifier(conversation_id),
      wa_message_id_hash: hashIdentifier(waMessageId),
      content_type: contentType,
      media_type: media_type || null,
      text_present: !!messageText,
      media_url_present: !!media_url,
      status: msgError ? 'error' : 'sent',
      route: '/api/send-message'
    });

    res.json({ 
      success: true, 
      message: 'Mensagem enviada com sucesso',
      wa_message_id: waMessageId || null,
      persisted: !msgError,
      warning: msgError ? 'persist_failed' : undefined
    });
  } catch (error) {
    safeError('send_message_failed', error, {
      route: '/api/send-message'
    });
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
