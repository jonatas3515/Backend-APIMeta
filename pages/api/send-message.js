import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'your_whatsapp_phone_number_id_here';
const WHATSAPP_API_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

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

    if (convError || !conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Verificar permissão de acesso
    // Admin e Advogado podem acessar todas as conversas
    // Estagiário só pode acessar conversas atribuídas a ele
    if (userRole === 'estagiario' && conversation.assigned_user_id !== userId) {
      return res.status(403).json({ error: 'Você não tem permissão para enviar mensagens nesta conversa' });
    }

    // Monta payload do WhatsApp
    let whatsappPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: conversation.client_phone,
      type: 'text',
      text: { body: text }
    };

    // Se tem mídia, envia como documento/imagem/áudio
    let contentType = 'text';
    if (media_url) {
      const isImage = media_type?.startsWith('image/');
      const isAudio = media_type?.startsWith('audio/');
      
      if (isImage) {
        whatsappPayload.type = 'image';
        whatsappPayload.image = { link: media_url, caption: text };
        delete whatsappPayload.text;
        contentType = 'image';
      } else if (isAudio) {
        // Meta aceita audio/ogg, audio/mp4, audio/mpeg, audio/aac, audio/amr
        // audio/webm pode ser rejeitado, então enviamos como documento se for webm
        if (media_type === 'audio/webm') {
          console.log('[SEND-MESSAGE] Áudio webm detectado, enviando como documento para compatibilidade');
          whatsappPayload.type = 'document';
          whatsappPayload.document = { 
            link: media_url, 
            caption: text,
            filename: `audio-${Date.now()}.webm`
          };
          delete whatsappPayload.text;
          contentType = 'document';
        } else {
          whatsappPayload.type = 'audio';
          whatsappPayload.audio = { link: media_url };
          delete whatsappPayload.text;
          contentType = 'audio';
        }
      } else {
        whatsappPayload.type = 'document';
        whatsappPayload.document = { link: media_url, caption: text };
        delete whatsappPayload.text;
        contentType = 'document';
      }
    }

    console.log('[SEND-MESSAGE] Payload:', JSON.stringify(whatsappPayload, null, 2));
    console.log('[SEND-MESSAGE] URL da mídia:', media_url, '| Tipo:', media_type);

    const waResponse = await axios.post(WHATSAPP_API_URL, whatsappPayload, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    const { error: msgError } = await supabase
      .from('messages')
      .insert([{
        conversation_id,
        direction: 'outbound',
        sender_type: 'human',
        content_type: contentType,
        text,
        media_url: media_url || null,
        media_type: media_type || null
      }]);

    if (msgError) {
      console.error('Erro ao salvar mensagem:', msgError);
    }

    res.json({ success: true, message: 'Mensagem enviada com sucesso' });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: error.message });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
