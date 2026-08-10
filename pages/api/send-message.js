import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '1289520100904873';
const WHATSAPP_API_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { conversation_id, text, media_url, media_type } = req.body;

    if (!conversation_id || !text) {
      return res.status(400).json({ error: 'conversation_id e text são obrigatórios' });
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('client_phone')
      .eq('id', conversation_id)
      .single();

    if (convError || !conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
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
    if (media_url) {
      const isImage = media_type?.startsWith('image/');
      const isAudio = media_type?.startsWith('audio/');
      
      if (isImage) {
        whatsappPayload.type = 'image';
        whatsappPayload.image = { link: media_url, caption: text };
        delete whatsappPayload.text;
      } else if (isAudio) {
        whatsappPayload.type = 'audio';
        whatsappPayload.audio = { link: media_url };
        delete whatsappPayload.text;
      } else {
        whatsappPayload.type = 'document';
        whatsappPayload.document = { link: media_url, caption: text };
        delete whatsappPayload.text;
      }
    }

    await axios.post(WHATSAPP_API_URL, whatsappPayload, {
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
        content_type: media_url ? (media_type?.startsWith('image/') ? 'image' : media_type?.startsWith('audio/') ? 'audio' : 'document') : 'text',
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
