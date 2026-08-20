const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'your_whatsapp_phone_number_id_here';
const WHATSAPP_API_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
const WHATSAPP_MEDIA_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/media`;

export async function sendWhatsAppMessage(to, text) {
  try {
    console.log('[WHATSAPP] Enviando mensagem de texto');
    console.log(`[WHATSAPP] URL: ${WHATSAPP_API_URL}`);
    console.log(`[WHATSAPP] Token: ${WHATSAPP_TOKEN ? '***' : 'NÃO CONFIGURADO'}`);

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

    console.log(`[WHATSAPP] Status da resposta: ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[WHATSAPP] ❌ Erro ao enviar mensagem: status ${response.status} ${response.statusText}`);
      // console.error('[WHATSAPP] Corpo omitido');
      throw new Error(`Erro ao enviar mensagem WhatsApp: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const messageId = data.messages?.[0]?.id;
    console.log(`[WHATSAPP] ✅ Mensagem enviada com sucesso. ID: ${messageId}`);
    return messageId || null;
  } catch (error) {
    console.error(`[WHATSAPP] ❌ Erro ao enviar mensagem: ${error.message}`);
    throw error;
  }
}

// Faz upload de mídia para o servidor da Meta (recomendado para áudio, vídeo, imagem)
export async function uploadMediaToWhatsApp(fileBuffer, mimeType) {
  try {
    console.log(`[WHATSAPP] Fazendo upload de mídia para Meta. Tamanho: ${fileBuffer.length}, Tipo: ${mimeType}`);

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

    console.log(`[WHATSAPP] Upload status: ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[WHATSAPP] ❌ Erro no upload de mídia: status ${response.status} ${response.statusText}`);
      // console.error('[WHATSAPP] Corpo omitido');
      throw new Error(`Erro ao fazer upload de mídia: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[WHATSAPP] ✅ Mídia uploadada. ID: ${data.id}`);
    return data.id;
  } catch (error) {
    console.error(`[WHATSAPP] ❌ Erro ao fazer upload de mídia: ${error.message}`);
    throw error;
  }
}

// Envia mensagem de mídia usando media_id (compatível com áudio webm convertido pela Meta)
export async function sendWhatsAppMediaMessage(to, mediaId, mediaType, caption = '') {
  try {
    console.log('[WHATSAPP] Enviando mídia, tipo: ' + mediaType);

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

    console.log(`[WHATSAPP] Status da resposta: ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[WHATSAPP] ❌ Erro ao enviar mídia: status ${response.status} ${response.statusText}`);
      // console.error('[WHATSAPP] Corpo omitido');
      throw new Error(`Erro ao enviar mídia WhatsApp: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const messageId = data.messages?.[0]?.id;
    console.log(`[WHATSAPP] ✅ Mídia enviada com sucesso. ID: ${messageId}`);
    return messageId || null;
  } catch (error) {
    console.error(`[WHATSAPP] ❌ Erro ao enviar mídia: ${error.message}`);
    throw error;
  }
}
