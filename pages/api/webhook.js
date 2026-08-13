import { createClient } from '@supabase/supabase-js';
import { detectArea, getNextQuestion, isIntakeComplete, getFlow, getTriageQuestion, TRIAGE_FIELDS } from '../../lib/intakeFlows';
import { transcribeAudio, summarizeMedia } from '../../lib/mediaProcessing';

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'your_whatsapp_phone_number_id_here';
const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_WHATSAPP_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER || '557399348552';

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
    // Responde o mais rápido possível em rotinas de status/keep-alive
    const ack = () => res.status(200).json({ success: true, processed: false });
    
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
      const statuses = value?.statuses;

      console.log(`[WEBHOOK] Entry:`, entry ? 'existe' : 'null');
      console.log(`[WEBHOOK] Changes:`, changes ? 'existe' : 'null');
      console.log(`[WEBHOOK] Value:`, value ? 'existe' : 'null');
      console.log(`[WEBHOOK] Mensagens recebidas:`, messages?.length || 0);
      console.log(`[WEBHOOK] Statuses recebidos:`, statuses?.length || 0);

      // Processar atualizações de status de entrega (sent, delivered, read, failed)
      if (statuses && statuses.length > 0) {
        await processDeliveryStatuses(statuses);
      }

      if (!messages || messages.length === 0) {
        console.log('[WEBHOOK] Nenhuma mensagem para processar');
        return ack();
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
        return ack();
      }

      console.log(`[WEBHOOK] ✅ Mensagem recebida de ${from}: ${textBody}`);

      // Buscar ou criar conversa no Supabase
      const conversation = await getOrCreateConversation(from, clientName);
      
      if (!conversation || !conversation.id) {
        console.error('[WEBHOOK] ❌ Conversa inválida, abortando processamento');
        return res.status(200).json({ success: false, error: 'Conversa inválida' });
      }
      
      // Verificar se o bot está pausado e se deve reativar automaticamente
      if (conversation.mode === 'human') {
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
      
      // ================= PROCESSAMENTO DE MÍDIA (SÓ UPLOAD, PROCESSAMENTO ASSÍNCRONO) =================
      let publicUrl = '';
      let mediaStatus = 'pending';
      
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
              mediaStatus = 'failed';
            } else {
              const { data: publicUrlData } = await supabase.storage
                .from('chat-files')
                .getPublicUrl(fileName);
              publicUrl = publicUrlData?.publicUrl || '';
              console.log(`[WEBHOOK] ✅ Mídia salva: ${publicUrl}`);

              if (messageType === 'audio' || messageType === 'video') {
                textBody = textBody || `[Áudio/vídeo enviado - processando transcrição...]`;
              }
            }
          } else {
            mediaStatus = 'failed';
          }
        } catch (mediaError) {
          console.error('[WEBHOOK] ❌ Erro ao baixar mídia:', mediaError.message);
          mediaStatus = 'failed';
        }
      } else {
        mediaStatus = '';
      }

      // Salvar mensagem do cliente (mídia vai para processamento assíncrono)
      if (conversation) {
        const savedMessage = await saveMessage(conversation.id, textBody, 'client', messageType, publicUrl, '', { media_status: mediaStatus || undefined });
        
        // Sugerir marcação de documento no checklist
        if (publicUrl && (messageType === 'image' || messageType === 'document' || messageType === 'video' || messageType === 'audio')) {
          await suggestDocumentChecklist(conversation.id, publicUrl, messageType, textBody, message);
        }

        // Marca conversa como não lida para o atendente
        await supabase
          .from('conversations')
          .update({ unread: true })
          .eq('id', conversation.id);
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
        // Pega mensagens das últimas 24h ou até 50 mensagens (o que for maior)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: messages } = await supabase
          .from('messages')
          .select('text, sender_type, created_at')
          .eq('conversation_id', conversation.id)
          .or(`created_at.gte.${oneDayAgo}, and()`)  // mensagens das últimas 24h
          .order('created_at', { ascending: true });
        
        // Limita a 50 mensagens mais recentes se houver muitas
        const recentMessages = messages?.slice(-50) || [];
        
        if (recentMessages.length > 0) {
          conversationHistory = recentMessages.map(m => {
            const role = m.sender_type === 'client' ? 'Cliente' : 'Jhon';
            const time = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            return `[${time}] ${role}: ${m.text}`;
          }).join('\n');
          console.log(`[WEBHOOK] 📜 Histórico com ${recentMessages.length} mensagens`);
        }
      }

      // Resposta da IA para mídia
      let promptForAI = textBody;
      let isMediaAudio = messageType === 'audio' || messageType === 'video';
      
      if (messageType !== 'text') {
        if (isMediaAudio) {
          // Se for áudio/vídeo, tenta transcrever de forma assíncrona (sem bloquear resposta)
          if (publicUrl) {
            // Inicia transcrição em background (não aguarda)
            transcribeAudioAsync(conversation.id, publicUrl, messageType).catch(err => {
              console.error('[WEBHOOK] Erro ao transcrever áudio em background:', err.message);
            });
          }
          promptForAI = `Cliente enviou um ${messageType}. Diga: "Recebido! Estou analisando o áudio agora..." NUNCA mencione equipe, advogado ou retorno.`;
        } else if (textBody && !textBody.includes('processando transcrição')) {
          promptForAI = `O cliente enviou ${messageType} com a seguinte legenda/descrição: ${textBody}. Responda de forma breve, objetiva e educada.`;
        } else {
          promptForAI = `Cliente enviou ${messageType}. Responda: "Recebido! Para agilizar, consegue me contar por texto o que é o arquivo?" NUNCA mencione equipe, advogado ou retorno.`;
        }
      }

      // Chamar Gemini com await (timeout de 15s)
      const aiReply = await askGemini(promptForAI, conversationHistory, conversation);
      console.log(`[WEBHOOK] ✅ Resposta da IA: ${aiReply?.substring(0, 100)}`);

      // Detectar se precisa de atendimento humano
      const intakeCompleted = conversation?.intake_data?.completed === true;
      const needsHuman = detectNeedsHuman(textBody, aiReply, intakeCompleted);
      
      // Salvar resposta da IA
      if (conversation) {
        await saveMessage(conversation.id, aiReply, 'ai');
        
        // Marcar conversa como precisando de humano
        if (needsHuman && conversation.id) {
          await supabase
            .from('conversations')
            .update({ mode: 'human' })
            .eq('id', conversation.id);
          
          console.log(`[WEBHOOK] 🔔 Conversa marcada como mode=human`);
          
          // Enviar notificação para o WhatsApp pessoal configurado
          try {
            const notificationMessage = `🔔 *Atendimento Humano Solicitado*\n\nCliente: ${clientName}\nTelefone: ${from}\nÚltima mensagem: "${textBody}"\n\nAcesse: https://backend-apimeta.vercel.app/`;
            if (!ADMIN_WHATSAPP_NUMBER) {
              console.warn('[WEBHOOK] ⚠️ ADMIN_WHATSAPP_NUMBER não configurado. Notificação não enviada.');
            } else {
              await sendWhatsAppMessage(ADMIN_WHATSAPP_NUMBER, notificationMessage);
              console.log(`[WEBHOOK] 📲 Notificação enviada para ${ADMIN_WHATSAPP_NUMBER}`);
            }
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
      res.status(200).json({ success: false, error: error.message });
    }
  }
}

// Função para gerenciar coleta guiada de informações (intake) com triagem estruturada
async function handleIntake(conversation, clientMessage) {
  const msg = clientMessage.toLowerCase().trim();
  let intakeData = conversation.intake_data || {};
  let currentArea = conversation.legal_area;
  const triageStep = typeof intakeData.triage_step === 'number' ? intakeData.triage_step : -1;
  let triage = intakeData.triage || {};
  let currentStep = parseInt(intakeData.current_step || -1);

  console.log('[INTAKE] Estado:', {
    conversationId: conversation.id,
    legal_area: currentArea,
    triage_step: triageStep,
    current_step: currentStep,
    triage_completed: !!intakeData.triage_completed,
    message: clientMessage.substring(0, 50)
  });

  // ========== INTAKE DETALHADO ==========
  // Sempre prioriza o fluxo de intake se ele já começou (currentStep >= 0).
  // Isso evita que a triagem seja reexecutada acidentalmente.
  if (currentArea && currentStep >= 0) {
    const flow = getFlow(currentArea);
    if (!flow) return null;

    const previousQuestion = flow.questions[currentStep];
    if (previousQuestion) {
      intakeData[previousQuestion.field] = clientMessage;
      intakeData.answers = intakeData.answers || {};
      intakeData.answers[previousQuestion.field] = clientMessage;
    }

    const nextStep = currentStep + 1;

    if (isIntakeComplete(currentArea, nextStep)) {
      const summary = generateIntakeSummary(currentArea, intakeData.answers || {});
      
      const { error: finalError } = await supabase
        .from('conversations')
        .update({
          intake_data: { ...intakeData, completed: true, completed_at: new Date().toISOString() },
          case_summary: summary,
          funnel_stage: 'qualificacao',
          legal_area: currentArea
        })
        .eq('id', conversation.id);

      if (finalError) {
        console.error('[INTAKE] Erro ao finalizar intake:', finalError);
        return null;
      }

      return { reply: `Obrigado pelas informações! 📝\n\nResumo do seu caso:\n${summary}\n\nNossa equipe irá analisar e retornar em breve.`, completed: true };
    } else {
      const nextQuestion = getNextQuestion(currentArea, nextStep);
      if (!nextQuestion) {
        console.error('[INTAKE] Pergunta não encontrada para step:', nextStep);
        return null;
      }
      intakeData.current_step = nextStep;
      
      const { error: stepError } = await supabase
        .from('conversations')
        .update({
          intake_data: intakeData,
          legal_area: currentArea,
          funnel_stage: 'intake'
        })
        .eq('id', conversation.id);

      if (stepError) {
        console.error('[INTAKE] Erro ao avançar intake:', stepError);
        return null;
      }

      return { reply: nextQuestion.question };
    }
  }

  // ========== TRIAGEM ESTRUTURADA ==========
  // Etapa 0 a 3: pergunta municipality, agency, client_role e case_type
  if (currentArea && triageStep >= 0 && triageStep < TRIAGE_FIELDS.length) {
    const previousField = triageStep > 0 ? TRIAGE_FIELDS[triageStep - 1].field : null;
    if (previousField) {
      triage[previousField] = clientMessage;
      intakeData.triage = triage;
    }

    const nextIndex = triageStep;
    const nextField = TRIAGE_FIELDS[nextIndex].field;
    const question = getTriageQuestion(currentArea, nextField);
    intakeData.triage_step = triageStep + 1;

    const { error: triageError } = await supabase
      .from('conversations')
      .update({
        intake_data: intakeData,
        municipality: triage.municipality || null,
        agency: triage.agency || null,
        client_role: triage.client_role || null,
        case_type: triage.case_type || null
      })
      .eq('id', conversation.id);

    if (triageError) {
      console.error('[INTAKE] Erro ao atualizar triagem:', triageError);
      return null;
    }

    return { reply: question };
  }

  // Triagem completa: salva a última resposta (case_type) e inicia o intake detalhado
  if (currentArea && triageStep >= TRIAGE_FIELDS.length && !intakeData.triage_completed) {
    const lastField = TRIAGE_FIELDS[TRIAGE_FIELDS.length - 1].field;
    triage[lastField] = clientMessage;
    const nextIntakeData = {
      ...intakeData,
      triage,
      triage_completed: true,
      current_step: 0,
      answers: {},
      started_at: new Date().toISOString()
    };

    const { error: finishTriageError } = await supabase
      .from('conversations')
      .update({
        intake_data: nextIntakeData,
        municipality: triage.municipality || null,
        agency: triage.agency || null,
        client_role: triage.client_role || null,
        case_type: triage.case_type || null,
        funnel_stage: 'intake'
      })
      .eq('id', conversation.id);

    if (finishTriageError) {
      console.error('[INTAKE] Erro ao finalizar triagem e iniciar intake:', finishTriageError);
      return null;
    }

    const firstQuestion = getNextQuestion(currentArea, 0);
    return { reply: `Obrigado! Agora mais alguns detalhes: ${firstQuestion.question}` };
  }

  // ========== DETECÇÃO INICIAL DE ÁREA ==========
  const detectedArea = detectArea(clientMessage);
  
  if (detectedArea) {
    const flow = getFlow(detectedArea);
    const firstField = TRIAGE_FIELDS[0].field;
    const firstQuestion = getTriageQuestion(detectedArea, firstField);

    const { error: startError } = await supabase
      .from('conversations')
      .update({
        legal_area: detectedArea,
        intake_data: {
          triage_step: 0,
          triage: {},
          triage_completed: false,
          started_at: new Date().toISOString()
        },
        funnel_stage: 'triage'
      })
      .eq('id', conversation.id);

    if (startError) {
      console.error('[INTAKE] Erro ao iniciar triagem:', startError);
      return null;
    }

    return { reply: `Entendi que pode ser um caso de ${flow.displayName}. Vou fazer algumas perguntas rápidas para organizar as informações. ${firstQuestion}` };
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
// Só ativa handoff durante coleta quando o cliente pede expressamente.
// Após o intake completo, palavras de contexto jurídico também podem acionar.
function detectNeedsHuman(clientMessage, aiResponse, intakeCompleted = false) {
  const clientLower = clientMessage.toLowerCase();
  const aiLower = aiResponse.toLowerCase();
  
  // Solicitação expressa do cliente (sempre atende, independente do estágio)
  const expressRequest = [
    'falar com advogado',
    'falar com alguém',
    'falar com humano',
    'atendimento humano',
    'quero um advogado',
    'preciso de um advogado',
    'quero falar com',
    'preciso falar com',
    'quero atendimento',
    'preciso de atendimento',
    'atende ai',
    'atende aí',
    'chama alguém',
    'me transfere',
    'me passa',
    'passa pra pessoa',
    'passa para a pessoa',
    'passa pro advogado',
    'passa para o advogado',
    'pessoa de verdade',
    'advogado de verdade',
    'atendente',
    'me liga',
    'me ligue',
    'liga pra mim',
    'liga para mim',
    'me chama',
    'me chame',
    'meu atendente'
  ];
  
  const hasExpressRequest = expressRequest.some(keyword => clientLower.includes(keyword));
  
  // Palavras de contexto jurídico só disparam handoff após intake completo
  const contextKeywords = intakeCompleted ? [
    'prazo processual',
    'audiência',
    'contratar',
    'honorários',
    'quanto custa',
    'recurso',
    'prazo',
    'demissão',
    'licitação',
    'dispensado',
    'justa causa',
    'indenização',
    'processo',
    'ajuizar',
    'entrar com ação',
    'processo',
    'entrada',
    'colocar no pau',
    'andar',
    'andamento',
    'urgente'
  ] : [];
  
  // Verifica se a IA mencionou encaminhamento (desconsidera respostas automáticas de mídia)
  const aiMentionsForwarding = !clientLower.includes('[áudio enviado]') &&
                                (aiLower.includes('encaminhar') || 
                                 aiLower.includes('equipe') ||
                                 aiLower.includes('aguarde o retorno'));
  
  const hasContextKeyword = contextKeywords.some(keyword => clientLower.includes(keyword));
  
  return hasExpressRequest || hasContextKeyword || (intakeCompleted && aiMentionsForwarding);
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
async function saveMessage(conversationId, text, sender, messageType = 'text', mediaUrl = '', mediaSummary = '', extraData = {}) {
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
    if (extraData.media_status) insertData.media_status = extraData.media_status;
    if (extraData.media_transcript) insertData.media_transcript = extraData.media_transcript;

    const { data, error } = await supabase
      .from('messages')
      .insert(insertData)
      .select()
      .single();

    // Fallback: se a tabela ainda nao tem as colunas novas (migration nao aplicada), tenta salvar sem elas
    if (error) {
      const isColumnError = error.message && (
        error.message.includes('media_status') ||
        error.message.includes('media_transcript') ||
        error.message.includes('column')
      );

      if (isColumnError) {
        console.warn('[SUPABASE] Colunas de mídia não encontradas, salvando sem elas. Aplique a migration 020_add_media_transcript.sql:', error.message);
        const minimalInsertData = {
          conversation_id: conversationId,
          text,
          sender_type: senderType,
          direction: direction,
          content_type: messageType
        };
        if (mediaUrl) minimalInsertData.media_url = mediaUrl;
        if (mediaSummary) minimalInsertData.media_summary = mediaSummary;

        const { data: fallbackData, error: fallbackError } = await supabase
          .from('messages')
          .insert(minimalInsertData)
          .select()
          .single();

        if (fallbackError) throw fallbackError;
        console.log(`[SUPABASE] Mensagem salva (fallback): ${fallbackData.id}`);
        return fallbackData;
      }

      throw error;
    }

    console.log(`[SUPABASE] Mensagem salva: ${data.id}`);
    return data;
  } catch (error) {
    console.error('[SUPABASE] Erro ao salvar mensagem:', error);
    return null;
  }
}

const SYSTEM_PROMPT = `Você é o Jhon, assistente virtual da Neves & Costa Advocacia e Consultoria.

INFORMAÇÕES IMPORTANTES:
- O escritório Neves & Costa Advocacia NÃO POSSUI CNPJ (somente atendimento digital)
- Se cliente mencionar CNPJ ou cobrança em nosso nome, responda: "Atenção! A Neves & Costa Advocacia NÃO possui CNPJ. Isso pode ser de outro escritório ou cobrança bancária. Para verificar, entre em contato direto com a instituição. Nosso WhatsApp: (73) 9122-5215."

REGRAS CRÍTICAS:
1. NUNCA invente dados (CNPJ, endereço, OAB, nomes de advogados)
2. NUNCA repita apresentação após primeira mensagem
3. NUNCA use listas com asteriscos ou bullets
4. Respostas curtas: 1-3 frases
5. SÓ responda sobre CNPJ se cliente mencionar cobrança ou CNPJ
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
- CNPJ: NÃO POSSUI (somente atendimento digital)
- Endereço físico: NÃO POSSUI (atendimento digital)

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
- NUNCA prometa resultado ou vitória em processo
- NUNCA diga "vai conseguir", "você tem direito a X" ou "isso é ilegal" de forma definitiva
- SEMPRE sugerir análise formal com um advogado da equipe antes de qualquer conclusão
- Encaminhe casos complexos para equipe

SEGURANÇA E ÉTICA PROFISSIONAL (LGPD):
- NUNCA peça senhas, dados bancários completos ou informações sensíveis desnecessárias pelo WhatsApp
- NUNCA compartilhe dados de um cliente com terceiros
- NUNCA confirme identidade ou detalhes de caso sem cautela
- Se o cliente revelar assédio, violência, corrupção ou delação, responda com discrição e sigilo
- Siga o princípio do mínimo necessário: peça apenas informações estritamente relevantes

TOM DE RESPOSTA:
- NUNCA soar definitivo, autoritário ou como se a resposta fosse decisão final
- Use expressões como "Pode ser que...", "Um advogado precisa confirmar...", "A análise formal vai esclarecer..."
- Evite afirmações absolutas sobre direito, valores ou resultados

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
NÃO mencione "pelo WhatsApp" ou o número de telefone.`;

async function askGemini(prompt, conversationHistory = '', conversation = null) {
  try {
    console.log('[GEMINI] Tentando Gemini 2.5 Flash-Lite...');
    console.log('[GEMINI] API Key presente?', GEMINI_API_KEY ? 'Sim' : 'NÃO');
    
    // Monta o prompt com contexto completo da conversa
    let contextParts = [];
    
    if (conversation) {
      if (conversation.legal_area) {
        contextParts.push(`ÁREA DO CASO: ${conversation.legal_area}`);
      }
      if (conversation.case_summary) {
        contextParts.push(`RESUMO DO CASO: ${conversation.case_summary}`);
      }
      if (conversation.intake_data?.answers) {
        const answers = Object.entries(conversation.intake_data.answers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
        contextParts.push(`INFORMAÇÕES COLETADAS: ${answers}`);
      }
    }
    
    const contextBlock = contextParts.length > 0 
      ? `CONTEXTO ATUAL DO ATENDIMENTO:\n${contextParts.join('\n')}\n\n` 
      : '';
    
    const historyBlock = conversationHistory 
      ? `HISTÓRICO DAS ÚLTIMAS 24H (MAIS RECENTES POR ÚLTIMO):\n${conversationHistory}\n\n` 
      : '';
    
    const fullPrompt = `${contextBlock}${historyBlock}NOVA MENSAGEM DO CLIENTE: ${prompt}\n\nResponda como Jhon, considerando TODO o contexto acima. NUNCA repita saudação de apresentação. Responda apenas ao que foi perguntado.`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.error('[GEMINI] ⏱️ TIMEOUT de 12 segundos atingido!');
      controller.abort();
    }, 12000);
    
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
    // Fallback recebe o mesmo fullPrompt para manter contexto
    const fullPrompt = conversationHistory 
      ? `HISTÓRICO DA CONVERSA:\n${conversationHistory}\n\nNOVA MENSAGEM DO CLIENTE: ${prompt}`
      : prompt;
    
    const response = await fetch(GEMINI_API_URL_FALLBACK, {
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

// Transcrição assíncrona de áudio (não bloqueia resposta do webhook)
async function transcribeAudioAsync(conversationId, mediaUrl, mediaType) {
  try {
    console.log(`[WEBHOOK] Iniciando transcrição assíncrona para conversa ${conversationId}`);
    
    const mimeType = mediaType === 'audio' ? 'audio/ogg' : 'video/mp4';
    const transcript = await transcribeAudio(mediaUrl, mimeType);
    
    if (!transcript) {
      console.log('[WEBHOOK] Transcrição retornou vazia');
      return;
    }

    console.log(`[WEBHOOK] ✅ Áudio transcrito: ${transcript.substring(0, 100)}`);

    // Busca a conversa e histórico para gerar resposta
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      console.error('[WEBHOOK] Conversa não encontrada para resposta de áudio');
      return;
    }

    if (conversation.mode === 'human') {
      console.log('[WEBHOOK] Conversa em modo humano, não respondendo automaticamente');
      return;
    }

    // Busca histórico recente
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: messages } = await supabase
      .from('messages')
      .select('text, sender_type, created_at')
      .eq('conversation_id', conversationId)
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: true });

    const conversationHistory = messages?.slice(-50).map(m => {
      const role = m.sender_type === 'client' ? 'Cliente' : 'Jhon';
      const time = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `[${time}] ${role}: ${m.text}`;
    }).join('\n') || '';

    const prompt = `O cliente enviou um áudio com a seguinte transcrição:\n\n"${transcript}"\n\nResponda de forma breve, objetiva e educada como se estivesse respondendo diretamente ao cliente. NUNCA mencione que é uma transcrição.`;

    console.log('[WEBHOOK] Gerando resposta automática para áudio');
    const { askGemini } = await import('../../lib/ai.js');
    const aiReply = await askGemini(prompt, conversationHistory, conversation);

    // Salva resposta no banco
    const { error: saveError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        text: aiReply,
        sender_type: 'bot',
        direction: 'outbound',
        content_type: 'text'
      });

    if (saveError) {
      console.error('[WEBHOOK] Erro ao salvar resposta de áudio:', saveError);
      return;
    }

    // Envia resposta via WhatsApp
    const { sendWhatsAppMessage } = await import('../../lib/whatsapp.js');
    await sendWhatsAppMessage(conversation.client_phone, aiReply);
    console.log(`[WEBHOOK] ✅ Resposta automática enviada para áudio`);
  } catch (error) {
    console.error('[WEBHOOK] Erro na transcrição assíncrona:', error.message);
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

// Sugerir marcação de documento no checklist do caso
async function suggestDocumentChecklist(conversationId, publicUrl, messageType, textBody, message) {
  try {
    // Buscar caso ativo da conversa
    const { data: cases, error: caseError } = await supabase
      .from('cases')
      .select('id, case_type')
      .eq('conversation_id', conversationId)
      .neq('status', 'encerrado')
      .order('created_at', { ascending: false })
      .limit(1);

    if (caseError || !cases || cases.length === 0) {
      console.log('[WEBHOOK] ℹ️ Nenhum caso ativo para sugerir documento');
      return;
    }

    const caseItem = cases[0];

    // Buscar itens pendentes do checklist
    const { data: items, error: itemsError } = await supabase
      .from('case_document_checklists')
      .select('*')
      .eq('case_id', caseItem.id)
      .eq('status', 'pending');

    if (itemsError || !items || items.length === 0) {
      console.log('[WEBHOOK] ℹ️ Nenhum documento pendente no checklist');
      return;
    }

    // Montar texto de referência para matching
    const filename = message?.document?.filename || '';
    const caption = (message?.image?.caption || message?.video?.caption || message?.document?.caption || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const lowerText = (textBody + ' ' + filename + ' ' + caption)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const keywordsMap = {
      'RG': ['rg', 'identidade'],
      'CPF': ['cpf'],
      'CTPS': ['ctps', 'carteira de trabalho'],
      'Holerites (últimos 12 meses)': ['holerite', 'contracheque', 'recibo', 'pagamento'],
      'TRCT': ['trct', 'recibo de trabalho'],
      'FGTS': ['fgts'],
      'Carteira de Trabalho': ['carteira de trabalho', 'ctps'],
      'Laudos Médicos': ['laudo', 'laudo medico'],
      'Atestados': ['atestado', 'atestado medico']
    };

    for (const item of items) {
      const itemName = item.document_name;
      const normalizedName = itemName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const keys = keywordsMap[itemName] || [itemName.toLowerCase()];

      const matched = keys.some(key => {
        const normalizedKey = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return lowerText.includes(normalizedKey);
      });

      if (matched) {
        const { error: updateError } = await supabase
          .from('case_document_checklists')
          .update({
            status: 'sent',
            media_url: publicUrl,
            media_type: messageType,
            received_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (updateError) {
          console.error('[WEBHOOK] ❌ Erro ao sugerir documento:', updateError);
        } else {
          console.log(`[WEBHOOK] 📎 Documento sugerido como enviado: ${itemName}`);
        }
        return;
      }
    }

    console.log('[WEBHOOK] ℹ️ Nenhum documento do checklist correspondente encontrado');
  } catch (error) {
    console.error('[WEBHOOK] ❌ Erro ao sugerir checklist:', error);
  }
}

// Processar atualizações de status de entrega do WhatsApp
async function processDeliveryStatuses(statuses) {
  for (const status of statuses) {
    try {
      const waMessageId = status.id;
      const deliveryStatus = status.status;
      const error = status.errors?.[0] || null;

      console.log(`[WEBHOOK] 📬 Status de entrega: ${waMessageId} -> ${deliveryStatus}`);

      // Buscar mensagem pelo wa_message_id
      const { data: messages, error: findError } = await supabase
        .from('messages')
        .select('id')
        .eq('wa_message_id', waMessageId)
        .limit(1);

      if (findError) {
        console.error(`[WEBHOOK] ❌ Erro ao buscar mensagem por wa_message_id:`, findError);
        continue;
      }

      if (!messages || messages.length === 0) {
        console.log(`[WEBHOOK] ⚠️ Mensagem com wa_message_id ${waMessageId} não encontrada`);
        continue;
      }

      const updateData = {
        status: deliveryStatus,
      };

      if (error) {
        updateData.error_info = {
          code: error.code,
          title: error.title,
          message: error.message,
          details: error.error_data?.details,
          href: error.href
        };
      }

      const { error: updateError } = await supabase
        .from('messages')
        .update(updateData)
        .eq('id', messages[0].id);

      if (updateError) {
        console.error(`[WEBHOOK] ❌ Erro ao atualizar status da mensagem:`, updateError);
      } else {
        console.log(`[WEBHOOK] ✅ Status da mensagem ${messages[0].id} atualizado para ${deliveryStatus}`);
      }
    } catch (statusError) {
      console.error(`[WEBHOOK] ❌ Erro ao processar status:`, statusError);
    }
  }
}
