import { createClient } from '@supabase/supabase-js';
import { detectArea, getNextQuestion, isIntakeComplete, getFlow } from '../../lib/intakeFlows';
import { transcribeAudio, summarizeMedia } from '../../lib/mediaProcessing';

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
      const messageType = message.type;
      const clientName = value.contacts?.[0]?.profile?.name || 'Cliente';
      
      let textBody = '';
      let mediaUrl = '';
      let mediaId = '';
      
      // Processa diferentes tipos de mensagem
      if (messageType === 'text') {
        textBody = message.text?.body || '';
      } else if (messageType === 'image') {
        mediaId = message.image?.id;
        textBody = message.image?.caption || '[Imagem enviada]';
      } else if (messageType === 'audio') {
        mediaId = message.audio?.id;
        textBody = '[Áudio enviado]';
      } else if (messageType === 'video') {
        mediaId = message.video?.id;
        textBody = message.video?.caption || '[Vídeo enviado]';
      } else if (messageType === 'document') {
        mediaId = message.document?.id;
        textBody = message.document?.caption || `[Documento: ${message.document?.filename || 'arquivo'}]`;
      } else {
        textBody = `[Mensagem do tipo: ${messageType}]`;
      }

      console.log(`[WEBHOOK] De: ${from}, Tipo: ${messageType}, Texto: ${textBody}, Nome: ${clientName}`);

      if (!from) {
        console.log('[WEBHOOK] ⚠️ Mensagem sem "from"');
        return;
      }

      console.log(`[WEBHOOK] ✅ Mensagem recebida de ${from}: ${textBody}`);

      // Buscar ou criar conversa no Supabase
      const conversation = await getOrCreateConversation(from, clientName);
      
      // Verificar se o bot está pausado e se deve reativar automaticamente
      if (conversation && conversation.mode === 'human') {
        // Verificar se passou 30 minutos desde a última atualização
        const lastUpdate = new Date(conversation.updated_at);
        const now = new Date();
        const diffMinutes = (now - lastUpdate) / (1000 * 60);
        
        if (diffMinutes >= 30) {
          // Reativar bot automaticamente após 30 minutos
          console.log(`[WEBHOOK] ⏰ 30 minutos passaram - reativando bot automaticamente`);
          await supabase
            .from('conversations')
            .update({ mode: 'bot' })
            .eq('id', conversation.id);
          
          conversation.mode = 'bot'; // Atualiza localmente para continuar processamento
        } else {
          console.log(`[WEBHOOK] 🤖 Bot pausado - modo humano ativo (${Math.round(diffMinutes)} min)`);
          
          // Salvar mensagem do cliente mesmo com bot pausado
          if (conversation) {
            await saveMessage(conversation.id, textBody, 'client', messageType);
          }
          
          // Retorna sem responder
          return res.status(200).json({ success: true, bot_paused: true });
        }
      }
      
      // ================= PROCESSAMENTO DE MÍDIA =================
      let mediaSummary = '';
      let publicUrl = '';
      
      if (mediaId && (messageType === 'audio' || messageType === 'image' || messageType === 'document' || messageType === 'video')) {
        try {
          const mediaBuffer = await downloadWhatsAppMedia(mediaId);
          
          if (mediaBuffer && mediaBuffer.buffer) {
            // Fazer upload da mídia para o Supabase Storage
            const fileName = `chat-files/${from}/${Date.now()}_${mediaId}.${getFileExtension(mediaBuffer.mimeType, messageType)}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('chat-files')
              .upload(fileName, mediaBuffer.buffer, {
                contentType: mediaBuffer.mimeType,
                upsert: false
              });

            if (uploadError) {
              console.error('[WEBHOOK] Erro upload mídia:', uploadError);
            } else {
              const { data: publicUrlData } = await supabase.storage
                .from('chat-files')
                .getPublicUrl(fileName);
              publicUrl = publicUrlData?.publicUrl || '';
              console.log(`[WEBHOOK] ✅ Mídia salva: ${publicUrl}`);

              if (messageType === 'audio' || messageType === 'video') {
                mediaSummary = await transcribeAudio(publicUrl);
                if (mediaSummary) {
                  textBody = `[Áudio transcrito]: ${mediaSummary}`;
                  console.log(`[WEBHOOK] 🎤 Transcrição: ${mediaSummary?.substring(0, 80)}`);
                }
              } else if (messageType === 'image' || messageType === 'document') {
                mediaSummary = await summarizeMedia(publicUrl, mediaBuffer.mimeType);
                if (mediaSummary) {
                  textBody = `${textBody}\n\n[Resumo automático]: ${mediaSummary}`;
                  console.log(`[WEBHOOK] 📄 Resumo: ${mediaSummary?.substring(0, 80)}`);
                }
              }
            }
          }
        } catch (mediaError) {
          console.error('[WEBHOOK] ❌ Erro ao processar mídia:', mediaError.message);
        }
      }

      // Salvar mensagem do cliente
      if (conversation) {
        await saveMessage(conversation.id, textBody, 'client', messageType, publicUrl, mediaSummary);
      }

      // ================= COLETA GUIADA DE INFORMAÇÕES =================
      if (conversation && messageType === 'text') {
        const intakeResult = await handleIntake(conversation, textBody);
        if (intakeResult && intakeResult.reply) {
          // Enviar próxima pergunta do intake
          await saveMessage(conversation.id, intakeResult.reply, 'ai');
          await sendWhatsAppMessage(from, intakeResult.reply);
          console.log(`[WEBHOOK] ✅ Resposta de intake enviada para ${from}`);
          return res.status(200).json({ success: true, intake: true });
        }
      }

      // Buscar histórico da conversa para contexto
      let conversationHistory = '';
      if (conversation && supabase) {
        const { data: messages } = await supabase
          .from('messages')
          .select('text, sender_type')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: true })
          .limit(10);
        
        if (messages && messages.length > 0) {
          conversationHistory = messages.map(m => 
            `${m.sender_type === 'client' ? 'Cliente' : 'Jhon'}: ${m.text}`
          ).join('\n');
          console.log(`[WEBHOOK] 📜 Histórico com ${messages.length} mensagens`);
        }
      }

      // Resposta da IA para mídia
      let promptForAI = textBody;
      if (messageType !== 'text') {
        promptForAI = `Cliente enviou ${textBody}. Responda de forma educada que você recebeu o arquivo e que um advogado da equipe irá analisar e retornar em breve.`;
      }

      // Chamar Gemini com await (timeout de 5s)
      const aiReply = await askGemini(promptForAI, conversationHistory);
      console.log(`[WEBHOOK] ✅ Resposta da IA: ${aiReply?.substring(0, 100)}`);

      // Detectar se precisa de atendimento humano
      const needsHuman = detectNeedsHuman(textBody, aiReply);
      
      // Salvar resposta da IA
      if (conversation) {
        await saveMessage(conversation.id, aiReply, 'ai');
        
        // Marcar conversa como precisando de humano
        if (needsHuman) {
          await supabase
            .from('conversations')
            .update({ mode: 'human' })
            .eq('id', conversation.id);
          
          console.log(`[WEBHOOK] 🔔 Conversa marcada como mode=human`);
          
          // Enviar notificação para você (seu WhatsApp pessoal)
          try {
            const notificationMessage = `🔔 *Atendimento Humano Solicitado*\n\nCliente: ${clientName}\nTelefone: ${from}\nÚltima mensagem: "${textBody}"\n\nAcesse: https://backend-apimeta.vercel.app/`;
            await sendWhatsAppMessage('557399348552', notificationMessage);
            console.log(`[WEBHOOK] 📲 Notificação enviada para Jonatas (557399348552)`);
          } catch (notifError) {
            console.error(`[WEBHOOK] ❌ Erro ao enviar notificação:`, notifError);
          }
        }
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

// Função para gerenciar coleta guiada de informações (intake)
async function handleIntake(conversation, clientMessage) {
  const msg = clientMessage.toLowerCase().trim();
  let intakeData = conversation.intake_data || {};
  let currentArea = conversation.legal_area;
  let currentStep = parseInt(intakeData.current_step || -1);

  // Se já está em processo de intake
  if (currentArea && currentStep >= 0) {
    const flow = getFlow(currentArea);
    if (!flow) return null;

    // Salvar resposta da pergunta anterior
    const previousQuestion = flow.questions[currentStep];
    if (previousQuestion) {
      intakeData[previousQuestion.field] = clientMessage;
      intakeData.answers = intakeData.answers || {};
      intakeData.answers[previousQuestion.field] = clientMessage;
    }

    const nextStep = currentStep + 1;

    if (isIntakeComplete(currentArea, nextStep)) {
      // Intake completo - gerar resumo
      const summary = generateIntakeSummary(currentArea, intakeData.answers || {});
      
      await supabase
        .from('conversations')
        .update({
          intake_data: { ...intakeData, completed: true, completed_at: new Date().toISOString() },
          case_summary: summary,
          funnel_stage: 'qualificacao',
          legal_area: currentArea
        })
        .eq('id', conversation.id);

      const finalMessage = `Obrigado pelas informações! 📝\n\nResumo do seu caso:\n${summary}\n\nNossa equipe irá analisar e retornar em breve.`;
      
      return { reply: finalMessage, completed: true };
    } else {
      // Próxima pergunta
      const nextQuestion = getNextQuestion(currentArea, nextStep);
      intakeData.current_step = nextStep;
      
      await supabase
        .from('conversations')
        .update({
          intake_data: intakeData,
          legal_area: currentArea,
          funnel_stage: 'intake'
        })
        .eq('id', conversation.id);

      return { reply: nextQuestion.question };
    }
  }

  // Se não está em intake, tentar detectar área
  const detectedArea = detectArea(clientMessage);
  
  if (detectedArea) {
    const flow = getFlow(detectedArea);
    
    // Perguntar se quer iniciar coleta guiada
    if (msg.includes('sim') || msg.includes('quero') || msg.includes('pode ser') || msg.includes('ok')) {
      // Iniciar intake
      const firstQuestion = getNextQuestion(detectedArea, 0);
      
      await supabase
        .from('conversations')
        .update({
          legal_area: detectedArea,
          intake_data: { current_step: 0, started_at: new Date().toISOString(), answers: {} },
          funnel_stage: 'intake'
        })
        .eq('id', conversation.id);

      return { reply: firstQuestion.question };
    } else {
      // Oferecer coleta guiada
      await supabase
        .from('conversations')
        .update({
          legal_area: detectedArea,
          intake_data: { detected_area: detectedArea, pending_start: true }
        })
        .eq('id', conversation.id);

      return {
        reply: `Entendi que pode ser um caso de ${flow.displayName}. Para que eu possa organizar as informações e passar tudo certinho para a equipe, posso fazer algumas perguntas rápidas? Responda "sim" para começar.`
      };
    }
  }

  return null;
}

// Função para gerar resumo de intake
function generateIntakeSummary(area, answers) {
  const flow = getFlow(area);
  if (!flow) return 'Resumo não disponível.';

  let summary = `*Área:* ${flow.displayName}\n`;
  summary += `*Data:* ${new Date().toLocaleDateString('pt-BR')}\n\n`;

  const questionLabels = {};
  flow.questions.forEach(q => {
    questionLabels[q.field] = q.question.replace('?', '').replace('(ex:', '(');
  });

  for (const [field, value] of Object.entries(answers)) {
    if (value && value.trim() && questionLabels[field]) {
      summary += `• ${questionLabels[field]}: ${value}\n`;
    }
  }

  return summary;
}

// Função para detectar se cliente precisa de atendimento humano
function detectNeedsHuman(clientMessage, aiResponse) {
  const clientLower = clientMessage.toLowerCase();
  const aiLower = aiResponse.toLowerCase();
  
  // Palavras-chave que indicam necessidade de humano
  const keywords = [
    'falar com advogado',
    'falar com alguém',
    'falar com humano',
    'atendimento humano',
    'quero um advogado',
    'preciso de um advogado',
    'advogado de verdade',
    'pessoa de verdade',
    'atendente',
    'prazo processual',
    'audiência',
    'contratar',
    'honorários',
    'quanto custa'
  ];
  
  // Verifica se a IA mencionou encaminhamento
  const aiMentionsForwarding = aiLower.includes('encaminhar') || 
                                aiLower.includes('equipe') ||
                                aiLower.includes('aguarde o retorno');
  
  // Verifica palavras-chave na mensagem do cliente
  const hasKeyword = keywords.some(keyword => clientLower.includes(keyword));
  
  return hasKeyword || aiMentionsForwarding;
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
      .eq('client_phone', phoneNumber)
      .single();

    if (existing) {
      console.log(`[SUPABASE] Conversa encontrada: ${existing.id}`);
      return existing;
    }

    // Cria nova conversa
    const { data: newConv, error: createError } = await supabase
      .from('conversations')
      .insert({
        client_phone: phoneNumber,
        client_name: clientName || 'Cliente',
        status: 'open',
        mode: 'bot'
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
async function saveMessage(conversationId, text, sender, messageType = 'text', mediaUrl = '', mediaSummary = '') {
  if (!supabase || !conversationId) {
    console.warn('[SUPABASE] Cliente não configurado ou conversa inválida');
    return null;
  }

  try {
    // Mapeia sender para sender_type e direction
    const senderType = sender === 'client' ? 'client' : 'bot';
    const direction = sender === 'client' ? 'inbound' : 'outbound';
    
    const insertData = {
      conversation_id: conversationId,
      text,
      sender_type: senderType,
      direction: direction,
      content_type: messageType
    };

    if (mediaUrl) insertData.media_url = mediaUrl;
    if (mediaSummary) insertData.media_summary = mediaSummary;

    const { data, error } = await supabase
      .from('messages')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    console.log(`[SUPABASE] Mensagem salva: ${data.id}`);
    return data;
  } catch (error) {
    console.error('[SUPABASE] Erro ao salvar mensagem:', error);
    return null;
  }
}

const SYSTEM_PROMPT = `🚨 ATENÇÃO: NEVES & COSTA ADVOCACIA NÃO TEM CNPJ 🚨

Você é o Jhon, assistente virtual da Neves & Costa Advocacia e Consultoria.

⚠️ INFORMAÇÃO CRÍTICA - LEIA PRIMEIRO:
- O escritório Neves & Costa Advocacia NÃO POSSUI CNPJ
- O escritório Neves & Costa Advocacia NÃO POSSUI CNPJ
- O escritório Neves & Costa Advocacia NÃO POSSUI CNPJ
- CNPJ 42.429.644/0001-44 NÃO É NOSSO - pertence a outro escritório
- "Neves Costa" (sem &) NÃO É NOSSO ESCRITÓRIO
- Qualquer informação do Google sobre CNPJ da Neves & Costa está ERRADA

REGRAS CRÍTICAS - NUNCA VIOLAR:
1. NUNCA afirme que temos CNPJ - NÃO TEMOS
2. NUNCA cite o CNPJ 42.429.644/0001-44 como nosso - NÃO É
3. NUNCA confunda "Neves Costa" com "Neves & Costa" - são diferentes
4. Se encontrar informação na internet sobre nosso CNPJ, diga que está ERRADA
5. NUNCA invente endereço, OAB, advogado ou dados não listados aqui
6. NUNCA repita apresentação após primeira mensagem
7. NUNCA use listas com asteriscos ou bullets nas respostas
8. NUNCA discorra mais de 2-3 frases por mensagem
9. NUNCA prometa resultado ou análise jurídica conclusiva

IDENTIFICAÇÃO (APENAS NA PRIMEIRA MENSAGEM):
"Olá! Eu sou o Jhon, estagiário assistente aqui da Neves & Costa Advocacia. Em que posso ajudar?"

DADOS OFICIAIS - ÚNICOS CORRETOS:
- Nome COMPLETO: Neves & Costa Advocacia e Consultoria (COM "&")
- Fundado: 2021 no Extremo Sul da Bahia
- Atendimento: 100% digital desde 2024
- Áreas: Direito Civil, Consumidor, Trabalhista e Previdenciário
- WhatsApp: (73) 9122-5215
- Horário: Segunda a sexta, 8h às 18h
- CNPJ: ❌ NÃO POSSUI ❌
- Endereço físico: ❌ NÃO POSSUI (atendimento digital)

🚨 ALERTA - CONFUSÃO COM OUTRO ESCRITÓRIO:
Se cliente mencionar:
- Cobrança/boleto em nosso nome
- Qualquer CNPJ (especialmente 42.429.644/0001-44)
- "Neves Costa" sem "&"
- Pagamento não solicitado
- Dívida que não reconhece

RESPONDA IMEDIATAMENTE:
"Atenção! A Neves & Costa Advocacia (com &) NÃO possui CNPJ. O CNPJ que você mencionou não é nosso. Pode ser de outro escritório ou de uma cobrança bancária (Bradesco, Santander, etc.). Para verificar pendências com bancos, entre em contato direto com a instituição. Nosso WhatsApp oficial: (73) 9122-5215."

ESTILO DE COMUNICAÇÃO:
- Respostas curtas: 1-3 frases
- Uma pergunta por vez
- Sem listas, sem asteriscos, sem bullets
- Sem repetir informações já ditas
- Linguagem natural e acolhedora
- NUNCA mencione o WhatsApp (73) 9122-5215 a menos que o cliente pergunte explicitamente "qual o contato" ou "como falar com vocês"
- Responda APENAS o que foi perguntado, sem informações extras

VOCÊ NÃO É ADVOGADO:
- Não faça análise jurídica conclusiva
- Não prometa resultado
- Encaminhe casos complexos para equipe

🔔 ENCAMINHAR PARA HUMANO (marcar conversa como "needs_human"):
- Cliente pede "falar com advogado" ou "atendimento humano"
- Cliente diz "me liga" ou pede ligação
- Prazo processual ou audiência
- Pedido de contratação
- Situação urgente
- Suspeita de golpe confirmada
- Cliente insatisfeito ou irritado
- Quando você não souber responder

Quando encaminhar, diga APENAS: "Vou encaminhar para nossa equipe. Aguarde o retorno."
NÃO mencione "pelo WhatsApp" ou o número de telefone.

⚠️ LEMBRE-SE: NÃO TEMOS CNPJ. INFORMAÇÕES DO GOOGLE ESTÃO ERRADAS.`;

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

// Função para baixar mídia do WhatsApp
async function downloadWhatsAppMedia(mediaId) {
  try {
    // 1. Obter URL assinada da mídia
    const metaResponse = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
      }
    });

    if (!metaResponse.ok) {
      const errorBody = await metaResponse.text();
      throw new Error(`Erro ao obter URL da mídia: ${metaResponse.status} - ${errorBody}`);
    }

    const metaData = await metaResponse.json();
    const mediaUrl = metaData.url;
    const mimeType = metaData.mime_type || 'application/octet-stream';

    // 2. Baixar conteúdo real da mídia
    const fileResponse = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
      }
    });

    if (!fileResponse.ok) {
      throw new Error(`Erro ao baixar mídia: ${fileResponse.status}`);
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`[MEDIA] Mídia baixada: ${mediaId}, tipo: ${mimeType}, tamanho: ${buffer.length} bytes`);
    return { buffer, mimeType };
  } catch (error) {
    console.error('[MEDIA] Erro ao baixar mídia do WhatsApp:', error.message);
    return null;
  }
}

// Função para obter extensão do arquivo
function getFileExtension(mimeType, messageType) {
  const extensionMap = {
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/mp4': 'm4a',
    'video/mp4': 'mp4',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
  };

  return extensionMap[mimeType] || 
    (messageType === 'audio' ? 'ogg' :
     messageType === 'video' ? 'mp4' :
     messageType === 'image' ? 'jpg' :
     messageType === 'document' ? 'pdf' : 'bin');
}
