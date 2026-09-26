import { safeLog, safeError } from './safeLogger';

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'your_whatsapp_phone_number_id_here';
const WHATSAPP_API_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
const WHATSAPP_MEDIA_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/media`;

// Timeout capturável no ENVIO de mensagens: sem isso, um hang da Meta mantém
// o fetch pendurado até o maxDuration da Vercel matar a lambda — e nenhum
// estado final é gravado (áudio em processing, resposta em pending).
// 30s deixa margem antes do cap de 60s; AbortSignal.timeout rejeita com
// TimeoutError, que cai no catch existente e vira 'unconfirmed' no chamador.
// Env ausente/inválida/não positiva cai no default — nunca desativa o timeout.
const sendTimeoutMs = () => {
  const n = Number(process.env.WHATSAPP_SEND_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 30000;
};

// options.deadline (epoch ms): o timeout nunca excede o tempo que resta na
// invocação, preservando margem para o chamador gravar 'unconfirmed' e
// fechar o áudio antes de um possível fim da lambda. Sem deadline, vale o
// timeout fixo acima. Não é garantia contra kill de infraestrutura.
const effectiveSendTimeoutMs = (deadline) => {
  const base = sendTimeoutMs();
  if (deadline === undefined || deadline === null) return base;
  return Math.min(base, deadline - Date.now());
};

// Sem orçamento restante, não iniciar um envio condenado: rejeita com
// TimeoutError (mesma assinatura do abort) para o chamador marcar unconfirmed.
const noBudgetError = () => new DOMException('The operation timed out', 'TimeoutError');

export async function sendWhatsAppMessage(to, text, options = {}) {
  try {
    const timeoutMs = effectiveSendTimeoutMs(options.deadline);
    if (timeoutMs <= 0) throw noBudgetError();

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
      }),
      signal: AbortSignal.timeout(timeoutMs)
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
export async function sendWhatsAppMediaMessage(to, mediaId, mediaType, caption = '', filename = '', options = {}) {
  try {
    const timeoutMs = effectiveSendTimeoutMs(options.deadline);
    if (timeoutMs <= 0) throw noBudgetError();

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
      payload.document = { id: mediaId, caption, filename: filename || `arquivo-${Date.now()}` };
    }

    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs)
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
