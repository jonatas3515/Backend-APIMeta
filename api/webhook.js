const express = require('express');

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'your_whatsapp_phone_number_id_here';
const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY;

const WHATSAPP_API_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
const GEMINI_API_URL_PRIMARY = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_API_URL_FALLBACK = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

// GET /webhook - verificação do webhook pela Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificado com sucesso.');
    return res.status(200).send(challenge);
  }

  console.log('Falha na verificação do webhook.');
  return res.sendStatus(403);
});

// POST /webhook - recebe mensagens e eventos do WhatsApp
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) return;

    const message = messages[0];
    const from = message.from;
    const textBody = message.text?.body;

    if (!from || !textBody) return;

    console.log(`Mensagem recebida de ${from}: ${textBody}`);

    const aiReply = await askGemini(textBody);
    console.log(`Resposta da IA para ${from}: ${aiReply}`);
    await sendWhatsAppMessage(from, aiReply);
  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
  }
});

async function askGemini(prompt) {
  try {
    console.log('Tentando Gemini 2.5 Flash-Lite...');
    const response = await fetch(GEMINI_API_URL_PRIMARY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      })
    });

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return text || 'Desculpe, não consegui gerar uma resposta.';
    }

    console.warn(`Gemini 2.5 falhou (${response.status}), tentando fallback 1.5 Flash-Lite...`);
  } catch (error) {
    console.warn(`Erro ao tentar Gemini 2.5: ${error.message}, tentando fallback...`);
  }

  try {
    console.log('Tentando Gemini 1.5 Flash-Lite...');
    const response = await fetch(GEMINI_API_URL_FALLBACK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Erro na API Gemini 1.5: status ${response.status} ${response.statusText}, corpo: ${errorBody}`);
      throw new Error(`Erro na API Gemini: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || 'Desculpe, não consegui gerar uma resposta.';
  } catch (error) {
    console.error(`Erro em ambos os modelos Gemini: ${error.message}`);
    throw error;
  }
}

async function sendWhatsAppMessage(to, text) {
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

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Erro ao enviar mensagem WhatsApp: status ${response.status} ${response.statusText}, corpo: ${errorBody}`);
    throw new Error(`Erro ao enviar mensagem WhatsApp: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  console.log(`Resposta enviada para ${to}: ${text}`);
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
}

module.exports = app;
