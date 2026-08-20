import { createClient } from '@supabase/supabase-js';
import { createLogger, hashPhone, sanitizeError } from '../../lib/webhookLog';
import { detectArea, getNextQuestion, isIntakeComplete, getFlow, getTriageQuestion, TRIAGE_FIELDS } from '../../lib/intakeFlows';
import { transcribeAudio, summarizeMedia } from '../../lib/mediaProcessing';
import { normalizePhoneForMatch } from '../../lib/formatters';
import { loadClientMemory, formatClientMemory } from '../../lib/clientMemory';
import { getClientTitle } from '../../lib/genderFromName';
import { uploadMediaToWhatsApp, sendWhatsAppMediaMessage } from '../../lib/whatsapp.js';

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'your_whatsapp_phone_number_id_here';
const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_WHATSAPP_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER || '557399348552';
const NEVES_COSTA_IMAGE_URL = process.env.NEVES_COSTA_IMAGE_URL || 'https://backend-apimeta.vercel.app/Aviso.jpg';

const WHATSAPP_API_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
const GEMINI_API_URL_PRIMARY = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_API_URL_FALLBACK = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

// Cliente Supabase com service role key para bypass RLS
const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export default async function handler(req, res) {
  const { log } = createLogger(req);

  // GET - Verificação do webhook pela Meta
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    log('verify_request', { mode, tokenPresent: !!token, challenge: !!challenge, configured: !!VERIFY_TOKEN, match: token === VERIFY_TOKEN });

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      log('verify_success');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(challenge);
    }

    log('verify_failed');
    return res.status(403).json({ error: 'Falha na verificação' });
  }

  // POST - Recebe mensagens do WhatsApp
  if (req.method === 'POST') {
    // Responde o mais rápido possível em rotinas de status/keep-alive
    const ack = () => res.status(200).json({ success: true, processed: false });
    
    try {
      const entry = req.body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages = value?.messages;
      const statuses = value?.statuses;

      log('post_parsed', { messageCount: messages?.length || 0, statusCount: statuses?.length || 0 });

      // Processar atualizações de status de entrega (sent, delivered, read, failed)
      if (statuses && statuses.length > 0) {
        await processDeliveryStatuses(statuses);
      }

      if (!messages || messages.length === 0) {
        log('no_message_to_process');
        return ack();
      }

      const message = messages[0];
      const from = message.from;
      const waMessageId = message.id;
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

      log('message_received', { phoneHash: hashPhone(from), messageType, textLength: textBody?.length || 0, hasMedia: !!mediaId });

      // Evitar reprocessar mensagem já processada (retentativas do WhatsApp)
      if (supabase && waMessageId) {
        const { data: existing } = await supabase
          .from('messages')
          .select('id')
          .eq('wa_message_id', waMessageId)
          .eq('direction', 'inbound')
          .limit(1);

        if (existing && existing.length > 0) {
          log('duplicate_ignored', { waMessageId });
          return res.status(200).json({ success: true, duplicate: true });
        }
      }

      if (!from) {
        log('missing_from');
        return ack();
      }

      log('message_validated', { phoneHash: hashPhone(from), textLength: textBody?.length || 0 });

      // Buscar ou criar conversa no Supabase
      const conversation = await getOrCreateConversation(from, clientName);
      
      if (!conversation || !conversation.id) {
        log.error('invalid_conversation');
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
          log('bot_reactivated');
          await supabase
            .from('conversations')
            .update({ mode: 'bot' })
            .eq('id', conversation.id);
          
          conversation.mode = 'bot'; // Atualiza localmente para continuar processamento
        } else {
          log('bot_human_mode', { diffMinutes: Math.round(diffMinutes) });
          
          // Salvar mensagem do cliente mesmo com bot pausado
          if (conversation) {
            await saveMessage(conversation.id, textBody, 'client', messageType);
          }

          // Verifica se o cliente está aceitando termos LGPD
          if (conversation && messageType === 'text') {
            const { handled } = await handleConsent(conversation, textBody, from, req);
            if (handled) {
              return res.status(200).json({ success: true, consent: true });
            }
          }
          
          // Retorna sem responder
          return res.status(200).json({ success: true, bot_paused: true });
        }
      }
      
      // ================= PROCESSAMENTO DE MÍDIA (SÓ UPLOAD, PROCESSAMENTO ASSÍNCRONO) =================
      let publicUrl = '';
      let mediaStatus = 'pending';
      let mediaBuffer = null;
      
      if (mediaId && (messageType === 'audio' || messageType === 'image' || messageType === 'document' || messageType === 'video')) {
        try {
          mediaBuffer = await downloadWhatsAppMedia(mediaId);
          
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
              log.error('media_upload_failed', { error: sanitizeError(uploadError) });
              mediaStatus = 'failed';
            } else {
              const { data: publicUrlData } = await supabase.storage
                .from('chat-files')
                .getPublicUrl(fileName);
              publicUrl = publicUrlData?.publicUrl || '';
              log('media_uploaded', { mediaId, mimeType: mediaBuffer?.mimeType, size: mediaBuffer?.buffer?.length });

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
        const savedMessage = await saveMessage(conversation.id, textBody, 'client', messageType, publicUrl, '', { media_status: mediaStatus || undefined, media_type: mediaBuffer?.mimeType }, waMessageId);
        
        // Sugerir marcação de documento no checklist
        if (publicUrl && (messageType === 'image' || messageType === 'document' || messageType === 'video' || messageType === 'audio')) {
          await suggestDocumentChecklist(conversation.id, publicUrl, messageType, textBody, message);
        }

        // Marca conversa como não lida para o atendente
        await supabase
          .from('conversations')
          .update({ unread: true })
          .eq('id', conversation.id);

        // Verifica se o cliente está aceitando termos LGPD
        if (messageType === 'text') {
          const { handled } = await handleConsent(conversation, textBody, from, req);
          if (handled) {
            return res.status(200).json({ success: true, consent: true });
          }
        }
      }

      // ================= COLETA GUIADA DE INFORMAÇÕES =================
      if (conversation && messageType === 'text') {
        const intakeResult = await handleIntake(conversation, textBody);
        if (intakeResult && intakeResult.reply) {
          // Enviar próxima pergunta do intake
          await saveMessage(conversation.id, intakeResult.reply, 'ai');
          await sendWhatsAppMessage(from, intakeResult.reply);
          log('intake_replied', { phoneHash: hashPhone(from), replyLength: intakeResult.reply?.length || 0 });
          return res.status(200).json({ success: true, intake: true });
        }
      }

      // Buscar histórico da conversa para contexto
      let conversationHistory = '';
      if (conversation && supabase) {
        // Pega mensagens das últimas 24h ou até 50 mensagens (o que for maior)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: messages, error: historyError } = await supabase
          .from('messages')
          .select('text, sender_type, created_at')
          .eq('conversation_id', conversation.id)
          .gte('created_at', oneDayAgo)  // mensagens das últimas 24h
          .order('created_at', { ascending: true });
        
        if (historyError) console.error('[WEBHOOK] Erro ao buscar histórico:', sanitizeError(historyError));
        
        // Limita a 50 mensagens mais recentes se houver muitas
        const recentMessages = messages?.slice(-50) || [];
        
        if (recentMessages.length > 0) {
          conversationHistory = recentMessages.map(m => {
            const role = m.sender_type === 'client' ? 'Cliente' : 'Jhon';
            const time = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            return `[${time}] ${role}: ${m.text}`;
          }).join('\n');
          log('history_loaded', { messageCount: recentMessages.length });
        }
      }

      // === Resposta com imagem: confusão Neves Costa ===
      if (messageType === 'text' && isNevesCostaConfusion(textBody)) {
        log('neves_costa_confusion', { phoneHash: hashPhone(from) });
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const imageUrl = `${protocol}://${req.headers.host}/Aviso.jpg`;
        const imageSent = await sendNevesCostaImage(from, conversation.id, imageUrl);
        if (imageSent) {
          return res.status(200).json({ success: true, neves_costa: true });
        }
      }

      // === Respostas especiais: identidade, confirmação e marketing ===
      if (messageType === 'text') {
        const specialReply = getSpecialReply(textBody, clientName, conversationHistory);
        if (specialReply === 'NO_REPLY') {
          log('marketing_detected', { phoneHash: hashPhone(from) });
          return res.status(200).json({ success: true, marketing: true });
        }
        if (specialReply) {
          await saveMessage(conversation.id, specialReply, 'ai');
          await sendWhatsAppMessage(from, specialReply);
          log('special_replied', { phoneHash: hashPhone(from), replyLength: specialReply?.length || 0 });
          return res.status(200).json({ success: true, special: true });
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

      // Carregar memória do cliente para contexto
      const clientMemory = await loadClientMemory(conversation.id, from);
      const clientMemoryText = formatClientMemory(clientMemory);

      // Chamar Gemini com await (timeout de 15s)
      const aiReply = await askGemini(promptForAI, conversationHistory, conversation, clientMemoryText);
      log('ai_reply_generated', { length: aiReply?.length || 0 });

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
          
          log('human_mode_marked');
          
          // Enviar notificação para o WhatsApp pessoal configurado
          try {
            const notificationMessage = `🔔 *Atendimento Humano Solicitado*\n\nCliente: ${clientName}\nTelefone: ${from}\nÚltima mensagem: "${textBody}"\n\nAcesse: https://backend-apimeta.vercel.app/`;
            if (!ADMIN_WHATSAPP_NUMBER) {
              log.warn('admin_notif_unconfigured');
            } else {
              await sendWhatsAppMessage(ADMIN_WHATSAPP_NUMBER, notificationMessage);
              log('admin_notified');
            }
          } catch (notifError) {
            log.error('admin_notify_failed', { error: sanitizeError(notifError) });
          }
        }
      }

      // Enviar resposta via WhatsApp
      await sendWhatsAppMessage(from, aiReply);
      log('reply_sent', { phoneHash: hashPhone(from) });
      
      // Retorna sucesso após processar tudo
      res.status(200).json({ success: true });
    } catch (error) {
      log.error('handler_exception', { error: sanitizeError(error), stack: error.stack });
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

  // Ignorar saudações e perguntas que não respondem a triagem/intake
  const GREETINGS = ['bom dia', 'boa tarde', 'boa noite', 'oi', 'olá', 'ola', 'opa', 'e aí', 'e ai', 'eae', 'tudo bem', 'tudo certo', 'tudo bom', 'tudo joia'];
  const isGreeting = GREETINGS.some(g => msg.startsWith(g));
  const isQuestion = msg.includes('?');
  if (isGreeting || isQuestion) {
    return null;
  }

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
        console.error('[INTAKE] Erro ao finalizar intake:', sanitizeError(finalError));
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
        console.error('[INTAKE] Erro ao avançar intake:', sanitizeError(stepError));
        return null;
      }

      return { reply: nextQuestion.question };
    }
  }

  // ========== TRIAGEM ESTRUTURADA ==========
  // Salva a resposta da pergunta de triagem atual e, se terminou, inicia o intake detalhado
  if (currentArea && triageStep >= 0 && triageStep < TRIAGE_FIELDS.length) {
    const currentField = TRIAGE_FIELDS[triageStep].field;
    triage[currentField] = clientMessage;
    intakeData.triage = triage;

    const nextIndex = triageStep + 1;
    intakeData.triage_step = nextIndex;

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
      console.error('[INTAKE] Erro ao atualizar triagem:', sanitizeError(triageError));
      return null;
    }

    // Se terminou a triagem, inicia o intake detalhado
    if (nextIndex >= TRIAGE_FIELDS.length) {
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
        console.error('[INTAKE] Erro ao finalizar triagem e iniciar intake:', sanitizeError(finishTriageError));
        return null;
      }

      const firstQuestion = getNextQuestion(currentArea, 0);
      return { reply: `Entendi. Vamos agora aos detalhes: ${firstQuestion.question}` };
    }

    // Ainda há perguntas de triagem
    const nextField = TRIAGE_FIELDS[nextIndex].field;
    const question = getTriageQuestion(currentArea, nextField);
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
      console.error('[INTAKE] Erro ao finalizar triagem e iniciar intake:', sanitizeError(finishTriageError));
      return null;
    }

    const firstQuestion = getNextQuestion(currentArea, 0);
    return { reply: `Obrigado! Agora mais alguns detalhes: ${firstQuestion.question}` };
  }

  // ========== DETECÇÃO INICIAL DE ÁREA ==========
  // Só detecta a área na primeira mensagem do fluxo (quando ainda não há área definida)
  const detectedArea = detectArea(clientMessage);
  
  if (!currentArea && detectedArea) {
    const flow = getFlow(detectedArea);
    const firstQuestion = getNextQuestion(detectedArea, 0);

    const nextIntakeData = {
      triage_step: TRIAGE_FIELDS.length,
      triage: { case_type: clientMessage },
      triage_completed: true,
      current_step: 0,
      answers: {},
      started_at: new Date().toISOString()
    };

    const { error: startError } = await supabase
      .from('conversations')
      .update({
        legal_area: detectedArea,
        case_type: clientMessage,
        intake_data: nextIntakeData,
        funnel_stage: 'intake'
      })
      .eq('id', conversation.id);

    if (startError) {
      console.error('[INTAKE] Erro ao iniciar triagem:', sanitizeError(startError));
      return null;
    }

    return { reply: `Entendi que pode ser um caso de ${flow.displayName}. Vamos aos detalhes: ${firstQuestion.question}` };
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

  const normalizedPhone = normalizePhoneForMatch(phoneNumber);

  try {
    // Busca a conversa mais antiga com o número normalizado
    const { data: existing, error: searchError } = await supabase
      .from('conversations')
      .select('*')
      .eq('client_phone_normalized', normalizedPhone)
      .order('created_at', { ascending: true })
      .limit(1)
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
        client_phone_normalized: normalizedPhone,
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
    // Se ocorrer conflito de telefone único, reutiliza a existente
    if (error.code === '23505') {
      const { data: existing, error: secondSearchError } = await supabase
        .from('conversations')
        .select('*')
        .eq('client_phone_normalized', normalizedPhone)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (existing) {
        console.log(`[SUPABASE] Conversa encontrada após conflito: ${existing.id}`);
        return existing;
      }
    }

    console.error('[SUPABASE] Erro ao buscar/criar conversa:', sanitizeError(error));
    return null;
  }
}

// Função para salvar mensagem
async function saveMessage(conversationId, text, sender, messageType = 'text', mediaUrl = '', mediaSummary = '', extraData = {}, waMessageId = null) {
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
      content_type: messageType,
      wa_message_id: waMessageId || undefined
    };

    if (mediaUrl) insertData.media_url = mediaUrl;
    if (mediaSummary) insertData.media_summary = mediaSummary;
    if (extraData.media_type) insertData.media_type = extraData.media_type;
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
        if (extraData.media_type) minimalInsertData.media_type = extraData.media_type;

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
    console.error('[SUPABASE] Erro ao salvar mensagem:', sanitizeError(error));
    return null;
  }
}

function normalizeForCheck(text) {
  return (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const POSITIVE_EMOJIS = [
  '👍','👌','🤝','👏','🙌','👐','☺','😊','🙂','😉','😄','😁','✅','🙏','💙','💖','❤','🤗','🥰','😍','🥳','😎','✌️','🫶','🤙'
];

function isConfirmationMessage(text) {
  if (!text || !text.trim()) return false;
  const trimmed = text.trim();
  const affirmatives = ['ok','sim','entendi','obrigado','obrigada','certo','combinado','fechado','blz','beleza','perfeito','ótimo','otimo','show','valeu'];
  const plain = normalizeForCheck(trimmed).replace(/[^a-z0-9\s]/g, '').trim();
  if (affirmatives.includes(plain)) return true;
  const hasPositive = POSITIVE_EMOJIS.some(e => trimmed.includes(e));
  if (hasPositive && trimmed.length <= 25) return true;
  return false;
}

const MARKETING_TERMS = [
  'oferta', 'imperdivel', 'imperdível', 'promocao', 'promoção', 'desconto',
  'plano controle', 'plano de', 'combo', 'internet todo', 'ligações ilimitadas',
  'gb de', 'gb por', 'fatura online', 'assine', 'contrate', 'portabilidade',
  'recarga', 'cashback', 'empréstimo', 'emprestimo', 'cartão de crédito',
  'credito pessoal', 'sua fatura', 'meu tim', 'meu vivo', 'meu claro', 'meu oi',
  'receba', 'exclusivo', 'por apenas r$', 'r$/mes', 'r$/mês', 'saiba mais',
  'acesse agora', 'aproveite', 'vamos retirar seu numero', 'vamos retirar seu número'
];

function isMarketingMessage(text) {
  const lower = normalizeForCheck(text);
  let hits = 0;
  for (const term of MARKETING_TERMS) {
    if (lower.includes(term)) hits++;
  }
  return hits >= 2;
}

function getClientGreeting(clientName) {
  if (!clientName || clientName === 'Cliente') return 'Senhor(a)';
  const title = getClientTitle(clientName);
  const cap = title ? title[0].toUpperCase() + title.slice(1) : 'Senhor(a)';
  return title ? `${cap} ${clientName}` : `${cap} ${clientName}`;
}

function isNevesCostaConfusion(text) {
  if (!text || !text.trim()) return false;
  const t = text.toLowerCase();
  const hasNevesCosta = /neves\s*costa|nevescosta/.test(t);
  const isCorrectFirm = /neves\s*([&e])\s*costa/.test(t);
  return hasNevesCosta && !isCorrectFirm;
}

async function sendNevesCostaImage(to, conversationId, imageUrl = NEVES_COSTA_IMAGE_URL) {
  try {
    if (!imageUrl) {
      console.warn('[WEBHOOK] URL da imagem Neves Costa não configurada');
      return false;
    }
    console.log(`[WEBHOOK] Baixando imagem Neves Costa: ${imageUrl}`);
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      throw new Error(`Erro ao baixar imagem: ${imageRes.status}`);
    }
    const arrayBuffer = await imageRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const mediaId = await uploadMediaToWhatsApp(buffer, 'image/jpeg');
    if (!mediaId) throw new Error('Media ID não retornado');

    const caption = 'Aviso importante: o escritório Neves & Costa não possui relação com a entidade "Neves Costa".';
    await sendWhatsAppMediaMessage(to, mediaId, 'image', caption);

    await saveMessage(conversationId, caption, 'ai', 'image', imageUrl, '', { media_type: 'image/jpeg' });

    console.log('[WEBHOOK] ✅ Imagem Neves Costa enviada');
    return true;
  } catch (error) {
    console.error('[WEBHOOK] ❌ Erro ao enviar imagem Neves Costa:', error.message);
    return false;
  }
}

const IDENTITY_KEYWORDS = [
  'cnpj', 'boleto', 'advocacia neves costa', 'neves costa', 'qual o cnpj',
  'cnpj de vocês', 'cnpj de vcs', 'seu cnpj', 'vocês cobram', 'me cobraram',
  'cobrança de vocês', 'cobranca de voces', 'cobrança de vcs', 'emitir boleto',
  'boleto de vocês', 'boleto de vcs', 'outro escritorio', 'outro escritório',
  'negociação de dívida', 'negociacao de divida'
];

const IDENTITY_ALREADY_SAID = [
  'não possuímos cnpj', 'não possuimos cnpj', 'não emitimos boletos',
  'não emite boletos', 'não fazemos cobranças', 'não temos relação',
  'sem relação com a', 'não temos relacao'
];

function getSpecialReply(text, clientName, history = '') {
  const lower = normalizeForCheck(text);
  const historyLower = normalizeForCheck(history);

  if (isMarketingMessage(text)) return 'NO_REPLY';

  const isIdentity = IDENTITY_KEYWORDS.some(k => lower.includes(k));
  const alreadySaid = IDENTITY_ALREADY_SAID.some(s => historyLower.includes(s));

  if (isIdentity) {
    const name = getClientGreeting(clientName);
    if (alreadySaid) {
      return `${name}, entendido. Se houver outra dúvida, estamos à disposição.`;
    }
    return `${name}, somos a Neves & Costa Advocacia (com &). Informamos que não emitimos boletos, e nem fazemos cobranças, além de não possuirmos CNPJ. Não temos relação nenhuma com a "Advocacia Neves Costa".`;
  }

  if (alreadySaid && isConfirmationMessage(text)) {
    const name = getClientGreeting(clientName);
    return `${name}, entendido. Estamos à disposição.`;
  }

  return null;
}

const SYSTEM_PROMPT = `Você é o Jhon, assistente virtual da Neves & Costa Advocacia e Consultoria.

IDENTIDADE E LIMITES:
- Nosso nome completo é "Neves & Costa Advocacia e Consultoria" (com &).
- Não emitimos boletos, não fazemos cobranças e não possuímos CNPJ.
- Não temos relação com a empresa "Advocacia Neves Costa" (sem &) de São Paulo.
- Atendemos de forma 100% digital, sem endereço físico.
- Não faça análise jurídica conclusiva, não prometa resultados e não afirme "você tem direito".

ÁREAS DE ATUAÇÃO:
- Atuamos em várias áreas do direito: Trabalhista, Previdenciário, Administrativo (servidor público), Cível, Consumidor, Família e Sucessões, Imobiliário, Criminal e outras áreas por meio de parcerias especializadas.
- A classificação provisória deste atendimento (ex: Consumidor) é apenas uma etiqueta inicial, NÃO limita as áreas de atuação do escritório.
- Se o cliente perguntar "Vocês trabalham na área X?" ou "Atuam em Y?", responda afirmativamente citando que atuamos em várias áreas e incluindo X quando cabível, e ofereça ajuda.

REGRAS DE CONVERSA (obrigatórias):
1. NUNCA se apresente mais de uma vez. Se o histórico já contiver uma mensagem sua, NÃO diga "Eu sou o Jhon..." ou "Olá" novamente.
2. Se a PRIMEIRA mensagem vier com nome, e-mail, telefone e/ou assunto (ex: formulário do site), agradeça brevemente e trate o assunto. NÃO peça nome, e-mail ou telefone novamente.
3. Respostas: 1-3 frases curtas. Sem listas, bullets ou asteriscos.
4. Uma pergunta por vez, somente quando necessário.
5. NUNCA repasse nosso WhatsApp/telefone, a menos que o cliente pergunte EXPLICITAMENTE "qual o contato" ou "como falar com vocês".
6. NUNCA peça dados que já aparecem no histórico ou no contexto.
7. Seja educado, objetivo e acolhedor.
8. NUNCA prometa resultado ou análise jurídica conclusiva.
9. Trate o cliente pelo nome quando souber. Se não souber o nome, use "Senhor(a)". Se souber o nome, identifique se é feminino ou masculino e use "senhora" ou "senhor" com o nome (ex: "senhora Emanuelly", "senhor João"). Se não conseguir ter certeza do gênero, use o nome sem título ou com "Senhor(a)".

AVISO DE CONFUSÃO COM OUTRO ESCRITÓRIO:
Apenas trate como confusão com outro escritório quando o cliente mencionar CNPJ, boleto, "Neves Costa" (sem &), "outro escritório" ou cobrança/boleto atribuídos a nós.
Palavras como "financiamento", "consórcio", "banco" ou "dívida" sozinhas, sem relação a CNPJ/boleto do nosso escritório, são tipos de caso e NÃO devem gerar esclarecimento.
Se houver confusão:
1. Responda IMEDIATAMENTE e ENXUTO: a Neves & Costa Advocacia (com &) não emite boletos, não faz cobranças e não possui CNPJ.
2. Deixe claro que NÃO temos relação com a "Advocacia Neves Costa".
3. NÃO repasse nosso telefone/contato nesse esclarecimento.
4. Oriente o cliente a buscar a empresa responsável pelo boleto/cobrança, preferencialmente pelo CNPJ constante no documento.
5. Se perguntarem se conhecemos o outro escritório, diga: "Não conhecemos e não temos relação. A única informação que sabemos é que, segundo relatos de clientes, eles são de São Paulo."
6. Depois do esclarecimento, NÃO ofereça outros serviços e NÃO liste áreas de atuação.
7. Se o esclarecimento já tiver sido dito e o cliente apenas confirmar, responda apenas "Entendido. Estamos à disposição." e NÃO repita o esclarecimento.

ENCAMINHAMENTO HUMANO:
- Encaminhe para a equipe quando o cliente pedir advogado/atendimento humano, prazo processual, audiência, contratação, urgência ou situação complexa.
- Quando encaminhar, diga apenas: "Vou encaminhar para nossa equipe. Aguarde o retorno."

LEMBRETE FINAL:
- Não se apresente se já houver resposta sua no histórico.
- NUNCA diga "Olá", "Oi" ou "Bom dia" após a primeira mensagem. Responda diretamente ao assunto.
- Se a PRIMEIRA mensagem for uma saudação, responda apenas a saudação. NÃO pergunte "Em que posso ajudar?" ou "O que gostaria de tratar?". Aguarde o cliente falar.
- Fale sempre como Jhon, em primeira pessoa. Use "posso", "nosso escritório". Evite "podemos" genérico.
- Não ofereça nosso telefone sem ser solicitado explicitamente.
- Responda APENAS ao que foi perguntado, sem informações extras.
- Trate o cliente como "senhor" ou "senhora", com respeito e cordialidade.`;

async function askGemini(prompt, conversationHistory = '', conversation = null, clientMemoryText = '') {
  try {
    console.log('[GEMINI] Tentando Gemini 2.5 Flash-Lite...');
    console.log('[GEMINI] API Key presente?', GEMINI_API_KEY ? 'Sim' : 'NÃO');
    
    // Monta o prompt com contexto completo da conversa
    let contextParts = [];
    
    if (conversation) {
      if (conversation.client_name) {
        const title = getClientTitle(conversation.client_name);
        contextParts.push(`NOME DO CLIENTE: ${conversation.client_name}${title ? `; TRATAMENTO: ${title}` : ''}`);
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
    
    const memoryBlock = clientMemoryText
      ? `${clientMemoryText}\n\n`
      : '';
    
    const historyBlock = conversationHistory 
      ? `HISTÓRICO DAS ÚLTIMAS 24H (MAIS RECENTES POR ÚLTIMO):\n${conversationHistory}\n\n` 
      : '';
    
    const firstTurn = !conversationHistory || conversationHistory.trim() === '';
    const noRepeatRule = firstTurn
      ? 'Se a primeira mensagem for uma saudação (oi, olá, bom dia), responda APENAS a saudação e NÃO pergunte nada. Se a mensagem já apresentar um caso ou pergunta, responda diretamente e NÃO diga "Olá".'
      : 'O histórico já existe. NÃO se apresente, NÃO diga "Olá", "Oi" ou "Bom dia" em nenhuma circunstância. Responda DIRETAMENTE ao assunto.';

    const fullPrompt = `${contextBlock}${memoryBlock}${historyBlock}NOVA MENSAGEM DO CLIENTE: ${prompt}\n\nDIRETRIZES PARA ESTA RESPOSTA:\n- ${noRepeatRule}\n- Responda DIRETAMENTE à NOVA MENSAGEM do cliente, usando o contexto e a memória apenas como referência. Não fique preso a uma informação anterior se o cliente mudou de assunto.\n- Se a mensagem mencionar CNPJ, boleto, "Neves Costa" (sem &), "outro escritório" ou cobrança atribuída a nós e o esclarecimento ainda NÃO tiver sido dito no histórico, o esclarecimento ENXUTO é a prioridade máxima. NUNCA trate "financiamento", "consórcio", "banco" ou "dívida" sozinhos como confusão — são tipos de caso. Depois de esclarecer, NÃO ofereça outros serviços.
- Se o esclarecimento sobre boleto/cobrança/Neves Costa JÁ tiver sido dito no histórico e o cliente apenas pedir ajuda sem apresentar uma nova dúvida jurídica, NÃO repita o esclarecimento. Diga respeitosamente que não podemos intervir, pois não somos a empresa do boleto, e ofereça-se a ouvir caso haja outro assunto jurídico — sem listar áreas de atuação.\n- Não peça nome, e-mail ou telefone que já estiverem no histórico, contexto ou memória.\n- Responda como Jhon, 1-3 frases, sem listas, sem telefone a menos que o cliente peça explicitamente.`;
    
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
      console.log('[GEMINI] ✅ Resposta do Gemini 2.5, comprimento:', text?.length || 0);
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
      ? `${clientMemoryText ? clientMemoryText + '\n\n' : ''}HISTÓRICO DA CONVERSA:\n${conversationHistory}\n\nNOVA MENSAGEM DO CLIENTE: ${prompt}`
      : (clientMemoryText ? clientMemoryText + '\n\nNOVA MENSAGEM DO CLIENTE: ' + prompt : prompt);
    
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
      // console.error('[GEMINI] Corpo omitido');
      throw new Error(`Erro na API Gemini: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('[GEMINI] ✅ Resposta do Gemini 3.1, comprimento:', text?.length || 0);
    return text || 'Desculpe, não consegui gerar uma resposta.';
  } catch (error) {
    console.error(`[GEMINI] ❌ Erro em ambos os modelos Gemini: ${error.message}`);
    throw error;
  }
}

async function sendWhatsAppMessage(to, text) {
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

    console.log('[WEBHOOK] ✅ Áudio transcrito, comprimento:', transcript?.length || 0);

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
      console.error('[WEBHOOK] Erro ao salvar resposta de áudio:', sanitizeError(saveError));
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
      throw new Error(`Erro ao obter URL da mídia: ${metaResponse.status}`);
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
          console.error('[WEBHOOK] ❌ Erro ao sugerir documento:', sanitizeError(updateError));
        } else {
          console.log(`[WEBHOOK] 📎 Documento sugerido como enviado: ${itemName}`);
        }
        return;
      }
    }

    console.log('[WEBHOOK] ℹ️ Nenhum documento do checklist correspondente encontrado');
  } catch (error) {
    console.error('[WEBHOOK] ❌ Erro ao sugerir checklist:', sanitizeError(error));
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
        console.error(`[WEBHOOK] ❌ Erro ao buscar mensagem por wa_message_id:`, sanitizeError(findError));
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
        console.error(`[WEBHOOK] ❌ Erro ao atualizar status da mensagem:`, sanitizeError(updateError));
      } else {
        console.log(`[WEBHOOK] ✅ Status da mensagem ${messages[0].id} atualizado para ${deliveryStatus}`);
      }
    } catch (statusError) {
      console.error(`[WEBHOOK] ❌ Erro ao processar status:`, sanitizeError(statusError));
    }
  }
}

// Detecta e registra aceite de consentimento LGPD enviado pelo cliente via WhatsApp
async function handleConsent(conversation, text, from, req) {
  try {
    const clean = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
    const firstWord = clean.split(/\s+/)[0];
    const ACCEPTED_WORDS = ['aceito', 'concordo', 'autorizo', 'aceita', '1'];
    const REJECTED_WORDS = ['revogo', 'revogar', 'negativo', 'recuso', 'nao', 'não', '2'];

    if (!ACCEPTED_WORDS.includes(firstWord) && !REJECTED_WORDS.includes(firstWord)) {
      return { handled: false };
    }

    const intake = conversation.intake_data || {};
    const requestSentAt = intake.consent_request_sent_at;
    const requestStatus = intake.consent_request_status;

    if (!requestSentAt || requestStatus !== 'pending') {
      return { handled: false };
    }

    // Solicitação válida por 24h
    const requestAge = Date.now() - new Date(requestSentAt).getTime();
    if (requestAge > 24 * 60 * 60 * 1000) {
      return { handled: false };
    }

    const isAccepted = ACCEPTED_WORDS.includes(firstWord);
    const ipAddress = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || req.connection?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;
    const now = new Date().toISOString();

    // Insere log de consentimento
    const { data: consentLog, error: insertError } = await supabase
      .from('consent_logs')
      .insert({
        conversation_id: conversation.id,
        consent_type: 'lgpd_geral',
        value: isAccepted,
        ip_address: ipAddress,
        user_agent: userAgent
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[WEBHOOK] ❌ Erro ao registrar consentimento:', sanitizeError(insertError));
      return { handled: false };
    }

    const protocol = consentLog.id.slice(0, 8).toUpperCase();
    const updatedIntake = {
      ...intake,
      consent_request_status: isAccepted ? 'accepted' : 'rejected',
      consent_accepted_at: isAccepted ? now : null,
      consent_protocol: protocol
    };

    const { error: updateError } = await supabase
      .from('conversations')
      .update({ intake_data: updatedIntake })
      .eq('id', conversation.id);

    if (updateError) {
      console.error('[WEBHOOK] ❌ Erro ao atualizar intake_data:', sanitizeError(updateError));
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://chatnevesecosta.vercel.app';
    const policyUrl = `${baseUrl}/politica-de-privacidade`;
    const confirmation = isAccepted
      ? `Obrigado! Seu consentimento para tratamento de dados pessoais foi registrado em nosso sistema.\n\nProtocolo: #${protocol}\n\nVocê pode revogar a qualquer momento respondendo *2* (ou REVOGO) ou entrando em contato conosco.\n\nSaiba mais: ${policyUrl}`
      : `Entendido. Seu não consentimento foi registrado. Entraremos em contato para orientar sobre os próximos passos.\n\nProtocolo: #${protocol}`;

    await sendWhatsAppMessage(from, confirmation);
    await saveMessage(conversation.id, confirmation, 'ai');
    console.log(`[WEBHOOK] ✅ Consentimento ${isAccepted ? 'aceito' : 'rejeitado'} registrado. Protocolo: ${protocol}`);

    return { handled: true };
  } catch (error) {
    console.error('[WEBHOOK] ❌ Erro no handleConsent:', sanitizeError(error));
    return { handled: false };
  }
}
