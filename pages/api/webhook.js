import { createClient } from '@supabase/supabase-js';

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'your_whatsapp_phone_number_id_here';
const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const WHATSAPP_API_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
const GEMINI_API_URL_PRIMARY = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_API_URL_FALLBACK = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

// Cliente Supabase com service role key para bypass RLS
const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

// Variável global para debug (temporário)
global.lastWebhookPost = null;

export default async function handler(req, res) {
  console.log(`[WEBHOOK] ${req.method} ${req.url}`);
  console.log(`[WEBHOOK] Full URL:`, `${req.headers['x-forwarded-proto']}://${req.headers['host']}${req.url}`);
  console.log(`[WEBHOOK] Headers:`, JSON.stringify(req.headers, null, 2));
  console.log(`[WEBHOOK] Body:`, JSON.stringify(req.body).substring(0, 200));

  // GET - Verificação do webhook pela Meta
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log(`[WEBHOOK] GET - mode: ${mode}, token: ${token}, challenge: ${challenge}`);
    console.log(`[WEBHOOK] VERIFY_TOKEN configurado: ${VERIFY_TOKEN ? '✅ Sim' : '❌ Não'}`);
    console.log(`[WEBHOOK] Token recebido: "${token}"`);
    console.log(`[WEBHOOK] Token esperado: "${VERIFY_TOKEN}"`);
    console.log(`[WEBHOOK] Tokens iguais? ${token === VERIFY_TOKEN}`);

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[WEBHOOK] ✅ Webhook verificado com sucesso.');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(challenge);
    }

    console.log('[WEBHOOK] ❌ Falha na verificação do webhook.');
    return res.status(403).json({ 
      error: 'Falha na verificação',
      debug: {
        mode,
        tokenRecebido: token,
        tokenEsperado: VERIFY_TOKEN,
        iguais: token === VERIFY_TOKEN
      }
    });
  }

  // POST - Recebe mensagens do WhatsApp
  if (req.method === 'POST') {
    // Desabilita timeout do socket para permitir processamento mais longo
    if (res.socket) {
      res.socket.setTimeout(0);
    }
    
    // Salva para debug
    global.lastWebhookPost = {
      timestamp: new Date().toISOString(),
      body: req.body,
      headers: req.headers,
    };
    
    console.error('[WEBHOOK] ========== INÍCIO POST ==========');
    console.error('[WEBHOOK] 📦 Body completo:', JSON.stringify(req.body, null, 2));
    console.error('[WEBHOOK] ========== FIM BODY ==========');

    try {
      const entry = req.body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages = value?.messages;

      console.log(`[WEBHOOK] Entry:`, entry ? 'existe' : 'null');
      console.log(`[WEBHOOK] Changes:`, changes ? 'existe' : 'null');
      console.log(`[WEBHOOK] Value:`, value ? 'existe' : 'null');
      console.log(`[WEBHOOK] Mensagens recebidas:`, messages?.length || 0);

      if (!messages || messages.length === 0) {
        console.log('[WEBHOOK] Nenhuma mensagem para processar');
        return;
      }

      const message = messages[0];
      const from = message.from;
      const textBody = message.text?.body;
      const clientName = value.contacts?.[0]?.profile?.name || 'Cliente';

      console.log(`[WEBHOOK] De: ${from}, Texto: ${textBody}, Nome: ${clientName}`);

      if (!from || !textBody) {
        console.log('[WEBHOOK] ⚠️ Mensagem sem "from" ou "text.body"');
        return;
      }

      console.log(`[WEBHOOK] ✅ Mensagem recebida de ${from}: ${textBody}`);

      // Buscar ou criar conversa no Supabase
      const conversation = await getOrCreateConversation(from, clientName);
      
      // Salvar mensagem do cliente
      if (conversation) {
        await saveMessage(conversation.id, textBody, 'client');
      }

      // Buscar histórico da conversa para contexto
      let conversationHistory = '';
      if (conversation && supabase) {
        const { data: messages } = await supabase
          .from('messages')
          .select('text, sender')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(10);
        
        if (messages && messages.length > 0) {
          conversationHistory = messages.reverse().map(m => 
            `${m.sender === 'client' ? 'Cliente' : 'Jhon'}: ${m.text}`
          ).join('\n');
        }
      }

      // Chamar Gemini com await (timeout de 5s)
      const aiReply = await askGemini(textBody, conversationHistory);
      console.log(`[WEBHOOK] ✅ Resposta da IA: ${aiReply?.substring(0, 100)}`);

      // Salvar resposta da IA
      if (conversation) {
        await saveMessage(conversation.id, aiReply, 'ai');
      }

      // Enviar resposta via WhatsApp
      await sendWhatsAppMessage(from, aiReply);
      console.log(`[WEBHOOK] ✅ Resposta enviada para ${from}`);
      
      // Retorna sucesso após processar tudo
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[WEBHOOK] ❌ Erro ao processar mensagem:', error.message);
      console.error('[WEBHOOK] Stack:', error.stack);
    }
  }
}

// Função para buscar ou criar conversa
async function getOrCreateConversation(phoneNumber, clientName) {
  if (!supabase) {
    console.warn('[SUPABASE] Cliente não configurado');
    return null;
  }

  try {
    // Busca conversa existente
    const { data: existing, error: searchError } = await supabase
      .from('conversations')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();

    if (existing) {
      console.log(`[SUPABASE] Conversa encontrada: ${existing.id}`);
      return existing;
    }

    // Cria nova conversa
    const { data: newConv, error: createError } = await supabase
      .from('conversations')
      .insert({
        phone_number: phoneNumber,
        client_name: clientName || 'Cliente',
        status: 'active',
        last_message: '',
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) throw createError;
    console.log(`[SUPABASE] Nova conversa criada: ${newConv.id}`);
    return newConv;
  } catch (error) {
    console.error('[SUPABASE] Erro ao buscar/criar conversa:', error);
    return null;
  }
}

// Função para salvar mensagem
async function saveMessage(conversationId, text, sender, messageType = 'text') {
  if (!supabase || !conversationId) {
    console.warn('[SUPABASE] Cliente não configurado ou conversa inválida');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        text,
        sender,
        message_type: messageType,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Atualiza última mensagem da conversa
    await supabase
      .from('conversations')
      .update({
        last_message: text.substring(0, 100),
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    console.log(`[SUPABASE] Mensagem salva: ${data.id}`);
    return data;
  } catch (error) {
    console.error('[SUPABASE] Erro ao salvar mensagem:', error);
    return null;
  }
}

const SYSTEM_PROMPT = `Você é o Jhon, assistente virtual da Neves & Costa Advocacia e Consultoria.

REGRAS CRÍTICAS - NUNCA VIOLAR:
1. NUNCA invente CNPJ, endereço, número de OAB, advogado ou dados que não estejam neste prompt
2. NUNCA pesquise na internet informações sobre o escritório
3. NUNCA afirme que o escritório tem CNPJ - ELE NÃO TEM
4. NUNCA repita sua apresentação após a primeira mensagem
5. NUNCA use listas com asteriscos ou bullets
6. NUNCA discorra mais de 2-3 frases por mensagem
7. NUNCA prometa resultado ou faça análise jurídica conclusiva

IDENTIFICAÇÃO (APENAS NA PRIMEIRA MENSAGEM):
"Olá! Eu sou o Jhon, estagiário assistente aqui da Neves & Costa Advocacia. Em que posso ajudar?"

DADOS OFICIAIS DO ESCRITÓRIO (ÚNICOS CORRETOS):
- Nome: Neves & Costa Advocacia e Consultoria (com "&")
- Fundado: 2021 no Extremo Sul da Bahia
- Atendimento: 100% digital desde 2024
- Áreas: Direito Civil, Consumidor, Trabalhista e Previdenciário
- WhatsApp: (73) 9122-5215
- Horário: Segunda a sexta, 8h às 18h
- CNPJ: NÃO POSSUI
- Endereço físico: NÃO POSSUI (atendimento digital)

ALERTA DE GOLPE - PRIORIDADE MÁXIMA:
Se alguém mencionar:
- Cobrança que não reconhece
- Boleto em nome do escritório
- CNPJ diferente ou qualquer CNPJ
- "Neves Costa" sem "&"
- Pagamento não solicitado

RESPONDA IMEDIATAMENTE:
"Atenção: a Neves & Costa Advocacia NÃO possui CNPJ e NÃO realiza cobranças. Isso pode ser um golpe. Não pague, não clique em links e não compartilhe dados. Se tiver dúvidas, confirme pelo WhatsApp oficial (73) 9122-5215."

ESTILO DE COMUNICAÇÃO:
- Respostas curtas: 1-3 frases
- Uma pergunta por vez
- Linguagem natural, sem formalismo excessivo
- Sem listas, sem asteriscos, sem bullets
- Sem repetir informações já ditas

VOCÊ NÃO É ADVOGADO:
- Não faça análise jurídica conclusiva
- Não prometa resultado
- Não garanta valores ou prazos
- Encaminhe casos complexos para a equipe

ENCAMINHAR PARA HUMANO quando houver:
- Prazo processual ou audiência
- Pedido de contratação
- Situação urgente
- Suspeita de golpe
- Cliente insatisfeito`;

async function askGemini(prompt, conversationHistory = '') {
  try {
    console.log('[GEMINI] Tentando Gemini 2.5 Flash-Lite...');
    console.log('[GEMINI] URL:', GEMINI_API_URL_PRIMARY.substring(0, 100) + '...');
    console.log('[GEMINI] API Key presente?', GEMINI_API_KEY ? 'Sim' : 'NÃO');
    
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.error('[GEMINI] ⏱️ TIMEOUT de 5 segundos atingido!');
      controller.abort();
    }, 5000);
    
    // Monta o prompt com histórico
    const fullPrompt = conversationHistory 
      ? `Histórico da conversa:\n${conversationHistory}\n\nNova mensagem do cliente: ${prompt}`
      : prompt;
    
    console.log('[GEMINI] Iniciando fetch...');
    const response = await fetch(GEMINI_API_URL_PRIMARY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [
          {
            parts: [{ text: fullPrompt }]
          }
        ]
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    console.log('[GEMINI] Fetch completou! Response status:', response.status);

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log('[GEMINI] ✅ Resposta do Gemini 2.5:', text?.substring(0, 100));
      return text || 'Desculpe, não consegui gerar uma resposta.';
    }

    console.warn(`[GEMINI] ⚠️ Gemini 2.5 falhou (${response.status}), tentando fallback 1.5...`);
  } catch (error) {
    console.warn(`[GEMINI] ⚠️ Erro ao tentar Gemini 2.5: ${error.message}`);
  }

  try {
    console.log('[GEMINI] Tentando Gemini 3.1 Flash-Lite (fallback)...');
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
      console.error(`[GEMINI] ❌ Erro na API Gemini 3.1: status ${response.status} ${response.statusText}`);
      console.error(`[GEMINI] Corpo: ${errorBody}`);
      throw new Error(`Erro na API Gemini: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('[GEMINI] ✅ Resposta do Gemini 3.1:', text?.substring(0, 100));
    return text || 'Desculpe, não consegui gerar uma resposta.';
  } catch (error) {
    console.error(`[GEMINI] ❌ Erro em ambos os modelos Gemini: ${error.message}`);
    throw error;
  }
}

async function sendWhatsAppMessage(to, text) {
  try {
    console.log(`[WHATSAPP] Enviando para ${to}...`);
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
      console.error(`[WHATSAPP] Corpo: ${errorBody}`);
      throw new Error(`Erro ao enviar mensagem WhatsApp: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json();
    console.log(`[WHATSAPP] ✅ Mensagem enviada com sucesso. ID: ${data.messages?.[0]?.id}`);
  } catch (error) {
    console.error(`[WHATSAPP] ❌ Erro ao enviar mensagem: ${error.message}`);
    throw error;
  }
}
