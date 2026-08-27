import { safeLog, safeError } from './safeLogger';

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'your_whatsapp_phone_number_id_here';
const WHATSAPP_API_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
const WHATSAPP_MEDIA_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/media`;

export async function sendWhatsAppMessage(to, text) {
  try {
    safeLog('info', 'whatsapp_send_text_start', {
      provider: 'whatsapp',
      hasToken: !!WHATSAPP_TOKEN
    });

    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: { body: text }
      })
    });

    safeLog('info', 'whatsapp_send_text_status', {
      provider: 'whatsapp',
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Erro ao enviar mensagem WhatsApp: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const messageId = data.messages?.[0]?.id;
    safeLog('info', 'whatsapp_send_text_success', {
      provider: 'whatsapp',
      messageId: messageId || null
    });
    return messageId || null;
  } catch (error) {
    safeError('whatsapp_send_text_failed', error, {
      provider: 'whatsapp',
      retryable: true
    });
    throw error;
  }
}

// Faz upload de mídia para o servidor da Meta (recomendado para áudio, vídeo, imagem)
export async function uploadMediaToWhatsApp(fileBuffer, mimeType) {
  try {
    safeLog('info', 'whatsapp_media_upload_start', {
      provider: 'whatsapp',
      payloadSize: fileBuffer.length,
      mediaType: mimeType
    });

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });
    const extension = mimeType.split('/')[1] || 'bin';
    const filename = `media-${Date.now()}.${extension}`;

    formData.append('file', blob, filename);
    formData.append('type', mimeType);
    formData.append('messaging_product', 'whatsapp');

    const response = await fetch(WHATSAPP_MEDIA_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
      },
      body: formData
    });

    safeLog('info', 'whatsapp_media_upload_status', {
      provider: 'whatsapp',
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Erro ao fazer upload de mídia: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    safeLog('info', 'whatsapp_media_upload_success', {
      provider: 'whatsapp',
      mediaId: data.id || null
    });
    return data.id;
  } catch (error) {
    safeError('whatsapp_media_upload_failed', error, {
      provider: 'whatsapp',
      retryable: true
    });
    throw error;
  }
}

// Envia mensagem de mídia usando media_id (compatível com áudio webm convertido pela Meta)
export async function sendWhatsAppMediaMessage(to, mediaId, mediaType, caption = '') {
  try {
    safeLog('info', 'whatsapp_media_send_start', {
      provider: 'whatsapp',
      mediaType
    });

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: mediaType,
    };

    if (mediaType === 'audio') {
      payload.audio = { id: mediaId };
    } else if (mediaType === 'image') {
      payload.image = { id: mediaId, caption };
    } else if (mediaType === 'video') {
      payload.video = { id: mediaId, caption };
    } else {
      payload.document = { id: mediaId, caption, filename: `arquivo-${Date.now()}` };
    }

    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    safeLog('info', 'whatsapp_media_send_status', {
      provider: 'whatsapp',
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Erro ao enviar mídia WhatsApp: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const messageId = data.messages?.[0]?.id;
    safeLog('info', 'whatsapp_media_send_success', {
      provider: 'whatsapp',
      messageId: messageId || null
    });
    return messageId || null;
  } catch (error) {
    safeError('whatsapp_media_send_failed', error, {
      provider: 'whatsapp',
      retryable: true
    });
    throw error;
  }
}
