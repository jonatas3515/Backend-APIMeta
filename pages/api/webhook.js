import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import crypto from 'crypto';
import { createLogger, hashPhone, hashIdentifier, sanitizeError } from '../../lib/webhookLog';
import { detectArea, getFlow } from '../../lib/intakeFlows';
import { transcribeAudio, summarizeMedia } from '../../lib/mediaProcessing';
import { normalizePhoneForMatch } from '../../lib/formatters';
import { loadClientMemory, formatClientMemory } from '../../lib/clientMemory';
import { getClientGreeting } from '../../lib/genderFromName';
import { withConversationQueue } from '../../lib/conversationQueue';
import { buildMessageMeta, parseMessageMeta, isInboundProcessed, markInboundProcessed, sortMessagesBySequence } from '../../lib/messageMeta';
import { uploadMediaToWhatsApp, sendWhatsAppMediaMessage } from '../../lib/whatsapp.js';
import { evaluateFunnelAutomation, registerFunnelEvent } from '../../lib/funnel-whatsapp.js';
import { detectThanks, getThanksReply, correctCommonMistakes } from '../../lib/bot-responses.js';
import { semanticSearch } from '../../lib/knowledge-embeddings.js';
import { detectNeedsHuman, notifyAdminHandoff, EXPRESS_HUMAN_KEYWORDS } from '../../lib/needsHuman.js';
import { SYSTEM_PROMPT } from '../../lib/systemPrompt.js';
const laborIntegration = require('../../lib/laborWebhookIntegration.js');
const { classifyLaborIntent } = require('../../lib/laborSettlementIntent.js');

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'your_whatsapp_phone_number_id_here';
const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NEVES_COSTA_IMAGE_URL = process.env.NEVES_COSTA_IMAGE_URL || 'https://backend-apimeta.vercel.app/Aviso.jpg';

const WHATSAPP_API_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
const GEMINI_API_URL_PRIMARY = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_API_URL_FALLBACK = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

// Cliente Supabase com service role key para bypass RLS
const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export default async function handler(req, res) {
  const __invocationStart = Date.now();
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
      let aiPromptText = '';
      let mediaUrl = '';
      let mediaId = '';
      let visionMedia = null;

      // Processa diferentes tipos de mensagem
      if (messageType === 'text') {
        textBody = message.text?.body || '';
        aiPromptText = textBody;
      } else if (messageType === 'image') {
        mediaId = message.image?.id;
        const caption = message.image?.caption || '';
        textBody = caption; // não exibe placeholder como conteúdo principal
        aiPromptText = caption ? `[Imagem recebida do cliente. Legenda: "${caption}"]` : '[Imagem recebida do cliente]';
      } else if (messageType === 'audio') {
        mediaId = message.audio?.id;
        textBody = '[Áudio enviado]';
        aiPromptText = textBody;
      } else if (messageType === 'video') {
        mediaId = message.video?.id;
        const caption = message.video?.caption || '';
        textBody = caption || '[Vídeo enviado]';
        aiPromptText = textBody;
      } else if (messageType === 'document') {
        mediaId = message.document?.id;
        const filename = message.document?.filename || 'arquivo';
        const caption = message.document?.caption || '';
        textBody = caption || `Documento: ${filename}`;
        aiPromptText = caption ? `Cliente enviou documento com legenda: ${caption}` : `Cliente enviou documento. Nome: ${filename}`;
      } else {
        textBody = `[Mensagem do tipo: ${messageType}]`;
        aiPromptText = textBody;
      }

      log('message_received', { phoneHash: hashPhone(from), messageType, textLength: textBody?.length || 0, hasMedia: !!mediaId });
      if (mediaId) {
        log('media_received', { messageType });
      }

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

      await withConversationQueue(from, async () => {
        let conversation = null;
        let seqCounter = 0;
        const bump = () => ++seqCounter;
        try {
          // Buscar ou criar conversa no Supabase
          conversation = await getOrCreateConversation(from, clientName);

          if (!conversation || !conversation.id) {
            log.error('invalid_conversation');
            res.status(200).json({ success: false, error: 'Conversa inválida' });
            return;
          }

          seqCounter = conversation.intake_data?.messageSequence || 0;

      // Idempotência: a fila serializa por telefone, mas reentregas da Meta podem
      // chegar a instâncias diferentes. Verificar no banco dentro do lock.
      const { data: existingInbound } = await supabase
        .from('messages')
        .select('id, internal_note')
        .eq('wa_message_id', waMessageId)
        .eq('direction', 'inbound')
        .limit(1);

      if (existingInbound && existingInbound.length > 0) {
        log('duplicate_ignored', { waMessageId });
        return res.status(200).json({ success: true, duplicate: true });
      }

      // Controle de sequência e metadados por conversa. Não altera o banco:
      // usa as colunas existentes (internal_note e created_at) e o intake_data JSONB.
      const receivedAt = new Date().toISOString();
      const baseTime = Date.now();
      const stamp = (s) => new Date(baseTime + s).toISOString();

      conversation.intake_data = conversation.intake_data || {};
      conversation.intake_data.processedMessageIds = conversation.intake_data.processedMessageIds || {};

      const inboundSeq = bump();
      const inboundMeta = buildMessageMeta({
        sourceMessageId: waMessageId,
        sequence: inboundSeq,
        receivedAt,
        processedAt: new Date().toISOString()
      });
      const inboundExtra = { internal_note: inboundMeta, created_at: stamp(inboundSeq) };

      const outMeta = (extra = {}) => {
        const s = bump();
        return {
          ...extra,
          internal_note: buildMessageMeta({
            sourceMessageId: waMessageId,
            sequence: s,
            receivedAt,
            processedAt: new Date().toISOString()
          }),
          created_at: stamp(s)
        };
      };
      
      // Verificar se o bot está pausado e se deve reativar automaticamente.
      // Um modo 'human' só silencia o bot quando um humano realmente assumiu
      // (mensagem com sender_type='human' dentro da janela de 30 minutos).
      // Handoff automático antigo sem humano ativo não deve silenciar o cliente.
      if (conversation.mode === 'human') {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: recentHumanMsgs } = await supabase
          .from('messages')
          .select('id')
          .eq('conversation_id', conversation.id)
          .eq('sender_type', 'human')
          .gte('created_at', thirtyMinutesAgo)
          .limit(1);

        const humanAssumed = Array.isArray(recentHumanMsgs) && recentHumanMsgs.length > 0;
        log('human_assumed', { assumed: humanAssumed });

        if (!humanAssumed) {
          log('bot_reactivated', { reason: 'no_human_assumed' });
          await supabase
            .from('conversations')
            .update({ mode: 'bot' })
            .eq('id', conversation.id);

          conversation.mode = 'bot'; // Atualiza localmente para continuar processamento
        } else {
          const lastUpdate = new Date(conversation.updated_at);
          const diffMinutes = (Date.now() - lastUpdate.getTime()) / (1000 * 60);
          log('bot_human_mode', { diffMinutes: Math.round(diffMinutes) });
          
          // Salvar mensagem do cliente mesmo com bot pausado
          if (conversation) {
            await saveMessage(conversation.id, textBody, 'client', messageType, '', '', inboundExtra, waMessageId);
          }

          // Verifica pedido de privacidade ou aceite de LGPD
          if (conversation && messageType === 'text') {
            const { handled: privacyHandled } = await handlePrivacyRequest(conversation, textBody, from, req, outMeta());
            if (privacyHandled) {
              return res.status(200).json({ success: true, privacy: true });
            }
            const { handled } = await handleConsent(conversation, textBody, from, req, outMeta());
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
      let inboundMessageId = null;
      
      if (mediaId && (messageType === 'audio' || messageType === 'image' || messageType === 'document' || messageType === 'video')) {
        try {
          mediaBuffer = await downloadWhatsAppMedia(mediaId);
          if (mediaBuffer && mediaBuffer.buffer) {
            log('media_downloaded', { messageType, mimeType: mediaBuffer.mimeType, size: mediaBuffer.buffer.length });

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
              log('vision_failure_reason', { reason: 'storage_upload_failed', messageType });
            } else {
              const { data: publicUrlData } = await supabase.storage
                .from('chat-files')
                .getPublicUrl(fileName);
              publicUrl = publicUrlData?.publicUrl || '';
              log('media_uploaded', { messageType, mimeType: mediaBuffer?.mimeType, size: mediaBuffer?.buffer?.length });

              if (messageType === 'image') {
                visionMedia = { mimeType: mediaBuffer.mimeType, base64: mediaBuffer.buffer.toString('base64') };
                log('vision_input_attached', { mimeType: mediaBuffer.mimeType });
              }

              if (messageType === 'audio' || messageType === 'video') {
                textBody = textBody || `[Áudio/vídeo enviado - processando transcrição...]`;
              }
            }
          } else {
            mediaStatus = 'failed';
            log('vision_failure_reason', { reason: 'media_download_failed', messageType });
          }
        } catch (mediaError) {
          console.error('[WEBHOOK] ❌ Erro ao baixar mídia:', mediaError.message);
          mediaStatus = 'failed';
          log('vision_failure_reason', { reason: 'media_download_exception', messageType });
        }
      } else {
        mediaStatus = '';
      }

      // Salvar mensagem do cliente (mídia vai para processamento assíncrono)
      if (conversation) {
        const savedMessage = await saveMessage(conversation.id, textBody, 'client', messageType, publicUrl, '', { ...inboundExtra, media_status: mediaStatus || undefined, media_type: mediaBuffer?.mimeType }, waMessageId);
        inboundMessageId = savedMessage?.id || null;
        
        // Sugerir marcação de documento no checklist
        if (publicUrl && (messageType === 'image' || messageType === 'document' || messageType === 'video' || messageType === 'audio')) {
          await suggestDocumentChecklist(conversation.id, publicUrl, messageType, textBody, message);
        }

        // Marca conversa como não lida para o atendente
        await supabase
          .from('conversations')
          .update({ unread: true })
          .eq('id', conversation.id);

        const eventType = evaluateFunnelAutomation({
          direction: 'inbound',
          text: textBody,
          firstContactAt: conversation.first_contact_at
        });

        if (eventType) {
          await registerFunnelEvent({
            supabase,
            conversationId: conversation.id,
            eventType,
            triggeredBy: 'system',
            metadata: {
              messageId: savedMessage?.id,
              direction: 'inbound',
              trigger: 'automation'
            }
          });
        }
      }

      // Carregar histórico da conversa para o contexto (máximo 4h)
      let conversationMessages = [];
      let activeMessages = [];
      if (conversation && supabase) {
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
        const { data: dbMessages, error: historyError } = await supabase
          .from('messages')
          .select('text, sender_type, created_at')
          .eq('conversation_id', conversation.id)
          .gte('created_at', fourHoursAgo)
          .order('created_at', { ascending: true });

        if (historyError) console.error('[WEBHOOK] Erro ao buscar histórico:', sanitizeError(historyError));
        conversationMessages = (dbMessages || []).slice(-50);
        activeMessages = laborIntegration.getActiveMessages(conversationMessages, conversation?.intake_data);
      }

      // Construir histórico legível para contexto (últimas 4 mensagens ativas,
      // respeitando resets). O prompt prioriza fatos confirmados; o histórico
      // entra como complemento, não como instrução.
      let conversationHistory = '';
      const recentMessages = activeMessages.slice(-4);
      if (recentMessages.length > 0) {
        conversationHistory = recentMessages.map(m => {
          const role = m.sender_type === 'client' ? 'Cliente' : 'Jhon';
          const time = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          return `[${time}] ${role}: ${m.text}`;
        }).join('\n');
        log('history_loaded', { messageCount: recentMessages.length });
      }

      // ================= ESCAPE / CANCELAMENTO / CONSENTIMENTO =================
      if (conversation && messageType === 'text') {
        const escape = detectEscapeIntent(textBody);
        if (escape === 'human') {
          const clearedIntake = { ...(conversation.intake_data || {}), current_step: -1, triage_step: -1 };
          await supabase.from('conversations').update({ mode: 'human', intake_data: clearedIntake }).eq('id', conversation.id);
          const handoffText = 'Vou encaminhar sua solicitação para nossa equipe. Aguarde o retorno.';
          const savedHandoff = await saveMessage(conversation.id, handoffText, 'ai', 'text', '', '', outMeta());
          const handoffWaId = await sendWhatsAppMessage(from, handoffText);
          if (savedHandoff && handoffWaId) {
            await supabase.from('messages').update({ wa_message_id: handoffWaId, status: 'sent' }).eq('id', savedHandoff.id);
          }
          await notifyAdminHandoff({ clientName, from, textBody, log });
          return res.status(200).json({ success: true, handoff: true });
        }
        if (escape === 'cancel') {
          const hasLaborContext = laborIntegration && typeof laborIntegration.lastBotMessageIsLaborQuestion === 'function' &&
            laborIntegration.lastBotMessageIsLaborQuestion(activeMessages);
          const hasIntakeContext = conversation.intake_data &&
            (conversation.intake_data.current_step >= 0 || conversation.intake_data.triage_step >= 0) &&
            !conversation.intake_data.completed;
          if (hasLaborContext || hasIntakeContext) {
            const clearedIntake = { ...(conversation.intake_data || {}), current_step: -1, triage_step: -1 };
            await supabase.from('conversations').update({ intake_data: clearedIntake }).eq('id', conversation.id);
            const cancelText = 'Certo, cancelei por aqui. Se precisar de ajuda com outro assunto, é só falar.';
            const savedCancel = await saveMessage(conversation.id, cancelText, 'ai', 'text', '', '', outMeta());
            const cancelWaId = await sendWhatsAppMessage(from, cancelText);
            if (savedCancel && cancelWaId) {
              await supabase.from('messages').update({ wa_message_id: cancelWaId, status: 'sent' }).eq('id', savedCancel.id);
            }
            log('flow_cancelled', { phoneHash: hashPhone(from) });
            return res.status(200).json({ success: true, cancel: true });
          }
        }
        const { handled: privacyHandled } = await handlePrivacyRequest(conversation, textBody, from, req, outMeta());
        if (privacyHandled) return res.status(200).json({ success: true, privacy: true });

        const { handled } = await handleConsent(conversation, textBody, from, req, outMeta());
        if (handled) return res.status(200).json({ success: true, consent: true });
      }

      // Timing sanitizado por estágio (apenas durações em ms e nome do handler —
      // sem texto, telefone, nome, valores ou IDs).
      const __pipelineStart = Date.now();
      const __stageMs = {};
      const logPipelineTiming = (handlerName) => {
        log('response_path', { path: handlerName });
        log('pipeline_timing', { ...__stageMs, total_ms: Date.now() - __pipelineStart, handler: handlerName });
      };

      // ================= TROCA DE DOMÍNIO ANTES DO MOTOR TRABALHISTA =================
      // Se houver contexto trabalhista ativo e a mensagem claramente mudar de área,
      // invalida o contexto trabalhista antes de qualquer resposta determinística.
      const hasActiveLaborContext = (conversation?._laborCalculation || conversation?.intake_data?.laborCalculation) &&
        conversation?.intake_data?.laborContextActive !== false;
      if (hasActiveLaborContext && textBody && conversation && supabase) {
        const detectedArea = detectArea(textBody);
        const { intent } = classifyLaborIntent(textBody);
        if (detectedArea && detectedArea !== 'trabalhista' && intent === 'other') {
          try {
            const resetIntakeData = laborIntegration.buildLaborContextReset(conversation.intake_data);
            conversation._laborCalculation = null;
            const { error: resetError } = await supabase
              .from('conversations')
              .update({ intake_data: resetIntakeData })
              .eq('id', conversation.id)
              .select();
            if (resetError) {
              log('topic_reset_failed', { error: sanitizeError(resetError), reason: 'domain_switch' });
              log('labor_context_invalidated', { success: false, errorCode: 'PERSIST_FAILED' });
              return res.status(200).json({ success: false, domainSwitch: false, error: 'reset_persist_failed' });
            }
            conversation.intake_data = resetIntakeData;
            log('topic_reset_persisted', { success: true, reason: 'domain_switch', newArea: detectedArea });
            log('labor_context_invalidated', { success: true, reason: 'domain_switch' });
            log('labor_estimate_injection_blocked', { reason: 'domain_switch' });
          } catch (err) {
            log('topic_reset_failed', { error: sanitizeError(err), reason: 'domain_switch' });
            return res.status(200).json({ success: false, domainSwitch: false });
          }
        }
      }

      // ================= CÁLCULO DE VERBAS TRABALHISTAS =================
      const __tLabor = Date.now();
      if (conversation && messageType === 'text' && laborIntegration && typeof laborIntegration.handleLaborSettlementWebhook === 'function') {
        let laborResult;
        try {
          const normalizedPhone = normalizePhoneForMatch(from);
          log('labor_integration_invoked');
          laborResult = await laborIntegration.handleLaborSettlementWebhook({
            conversation,
            normalizedPhone,
            waMessageId,
            textBody,
            messageType,
            messages: activeMessages,
            log
          });
          log('labor_integration_result', {
            handled: !!(laborResult && laborResult.handled),
            hasReply: !!(laborResult && laborResult.reply),
            flow: (laborResult && laborResult.flow) || null,
            errorCode: (laborResult && laborResult.errorCode) || null
          });
        } catch (err) {
          log('labor_integration_exception', { error: sanitizeError(err) });
          laborResult = { handled: false };
        }

        // Comando de troca de assunto: invalida contexto laboral, persiste e responde diretamente.
        if (laborResult && laborResult.reset && conversation && supabase) {
          try {
            const resetIntakeData = laborIntegration.buildLaborContextReset(conversation.intake_data);
            if (conversation) conversation._laborCalculation = null;
            const { data: resetData, error: resetError } = await supabase
              .from('conversations')
              .update({ intake_data: resetIntakeData })
              .eq('id', conversation.id)
              .select();
            if (resetError) {
              log('topic_reset_failed', { error: sanitizeError(resetError) });
              log('labor_context_invalidated', { success: false, errorCode: 'PERSIST_FAILED' });
              return res.status(200).json({ success: false, topicReset: false, error: 'reset_persist_failed' });
            }
            conversation.intake_data = resetIntakeData;
            log('topic_reset_persisted', { success: true });
            log('labor_context_invalidated', { success: true });
            log('labor_estimate_injection_blocked', { reason: 'topic_reset' });
            const resetReply = laborIntegration.RESET_REPLY_TEXT;
            const savedReset = await saveMessage(conversation.id, resetReply, 'ai', 'text', '', '', outMeta());
            const resetWaId = await sendWhatsAppMessage(from, resetReply);
            if (savedReset && resetWaId) {
              await supabase.from('messages').update({ wa_message_id: resetWaId, status: 'sent' }).eq('id', savedReset.id);
            }
            log('new_topic_started', { success: true, phoneHash: hashPhone(from) });
            __stageMs.labor_ms = Date.now() - __tLabor;
            logPipelineTiming('topic_reset');
            return res.status(200).json({ success: true, topicReset: true });
          } catch (err) {
            log('topic_reset_failed', { error: sanitizeError(err) });
            return res.status(200).json({ success: false, topicReset: false });
          }
        }

        // Persiste o cálculo trabalhista no estado da conversa (intake_data é JSONB)
        // para que as próximas mensagens injetem a estimativa no contexto do Gemini.
        if (laborResult && !laborResult.reset && laborResult.calculation && laborResult.calculation.totalEstimated != null && conversation && supabase) {
          try {
            const calc = laborResult.calculation;
            const laborCalculation = {
              totalEstimated: calc.totalEstimated,
              currency: calc.currency || 'BRL',
              calculatedAt: new Date().toISOString(),
              items: (calc.items || []).map(i => ({ code: i.code, name: i.name, amount: i.amount, status: i.status }))
            };
            conversation._laborCalculation = laborCalculation;
            const nextIntakeData = { ...(conversation.intake_data || {}), laborCalculation, laborContextActive: true };
            delete nextIntakeData.laborContextResetAt;
            const { data, error: laborCalcUpdateError } = await supabase
              .from('conversations')
              .update({ intake_data: nextIntakeData })
              .eq('id', conversation.id)
              .select();
            if (laborCalcUpdateError) {
              log('labor_calculation_persist_failed', { error: sanitizeError(laborCalcUpdateError) });
            } else {
              conversation.intake_data = nextIntakeData;
              log('labor_calculation_persisted', { success: true, itemsCount: laborCalculation.items.length });
            }
          } catch (err) {
            log('labor_calculation_persist_failed', { error: sanitizeError(err) });
          }
        }

        if (laborResult && laborResult.handled && laborResult.reply) {
          try {
            const savedLaborMsg = await saveMessage(conversation.id, laborResult.reply, 'ai', 'text', '', '', outMeta());
            const laborWaMessageId = await sendWhatsAppMessage(from, laborResult.reply);
            if (savedLaborMsg && laborWaMessageId) {
              await supabase.from('messages').update({ wa_message_id: laborWaMessageId, status: 'sent' }).eq('id', savedLaborMsg.id);
            }
            log('labor_reply_sent', { phoneHash: hashPhone(from), replyLength: laborResult.reply?.length || 0, hasWaMessageId: !!laborWaMessageId });
            if (!laborWaMessageId) {
              log('labor_whatsapp_send_failed', { reason: 'no_wa_message_id' });
            }
            // Grava a impressão digital da estimativa enviada para impedir que a
            // mesma estimativa seja reenviada como resposta nova em outro turno.
            if (laborResult.flow === 'labor_settlement_estimate' && laborWaMessageId) {
              try {
                const fpData = { ...(conversation.intake_data || {}), laborEstimateFingerprint: laborIntegration.estimateFingerprint(laborResult.reply) };
                const { error: fpError } = await supabase
                  .from('conversations')
                  .update({ intake_data: fpData })
                  .eq('id', conversation.id);
                if (fpError) {
                  log('estimate_fingerprint_persist_failed', { error: sanitizeError(fpError) });
                } else {
                  conversation.intake_data = fpData;
                  log('response_fingerprint', { flow: laborResult.flow });
                }
              } catch (fpErr) {
                log('estimate_fingerprint_persist_failed', { error: sanitizeError(fpErr) });
              }
            }
            __stageMs.labor_ms = Date.now() - __tLabor;
            logPipelineTiming('labor');
            return res.status(200).json({ success: true, labor: true });
          } catch (err) {
            log('labor_reply_send_exception', { error: sanitizeError(err) });
          }
        } else if (laborResult && laborResult.handled) {
          log('labor_handled_without_reply', { flow: laborResult.flow || null });
        } else {
          log('labor_normal_flow_fallback');
        }
      }
      __stageMs.labor_ms = Date.now() - __tLabor;
      const __tBoleto = Date.now();

      // ================= BOLETO / CONFUSÃO NEVES COSTA =================
      // Prioridade sobre intake: se a mensagem é sobre boleto/cobrança/CNPJ/Neves Costa,
      // invalida contexto previdenciário ativo e responde diretamente.
      // Restrito a conversas sem fluxo rígido ativo de outra área: palavras como "cnpj" e
      // "boleto" podem aparecer legitimamente no meio de um caso cível/consumidor/família
      // (ex: informando o CNPJ da empresa ré). Nesses casos, não interromper o fluxo.
      const previousAreaBeforeBoleto = conversation.legal_area || null;
      const currentStepBeforeBoleto = parseInt(conversation.intake_data?.current_step ?? -1, 10);
      const hasActiveOtherAreaFlow = !!previousAreaBeforeBoleto && previousAreaBeforeBoleto !== 'previdenciario' && currentStepBeforeBoleto >= 0;
      const boletoReply = hasActiveOtherAreaFlow ? null : getSpecialReply(textBody, clientName, conversationHistory, log);
      const isBoleto = boletoReply && boletoReply !== 'NO_REPLY';
      const isNevesCosta = !hasActiveOtherAreaFlow && messageType === 'text' && isNevesCostaConfusion(textBody);
      log('boleto_identity_state', { isBoleto: !!isBoleto, isNevesCosta: !!isNevesCosta, currentArea: conversation.legal_area || 'none', skippedForActiveFlow: hasActiveOtherAreaFlow });
      if (isBoleto || isNevesCosta) {
        log('boleto_handler_selected', { isIdentity: !!isBoleto, isNevesCosta: !!isNevesCosta });
        // Invalida pergunta pendente do domínio anterior, mas mantém fatos históricos
        const resetIntake = {
          ...(conversation.intake_data || {}),
          current_step: -1,
          triage_step: -1,
          triage_completed: false,
          completed: false
        };
        if (conversation && supabase) {
          const { error: resetError } = await supabase
            .from('conversations')
            .update({ intake_data: resetIntake, legal_area: null })
            .eq('id', conversation.id);
          if (resetError) {
            log('topic_reset_failed', { error: sanitizeError(resetError), reason: 'boleto_domain_switch' });
          } else {
            conversation.intake_data = resetIntake;
            conversation.legal_area = null;
            log('domain_switch_detected', { previousArea: 'previdenciario', newDomain: 'boleto_identity' });
            log('previdenciario_handler_skipped', { reason: 'domain_switch' });
          }
        }
        if (isNevesCosta) {
          const identityNoticeAlreadySent = !!conversation?.intake_data?.identity_notice_sent_at;
          if (!identityNoticeAlreadySent) {
            log('neves_costa_confusion', { phoneHash: hashPhone(from) });
            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const imageUrl = `${protocol}://${req.headers.host}/Aviso.jpg`;
            const imageSent = await sendNevesCostaImage(from, conversation.id, imageUrl, outMeta());
            if (imageSent) {
              conversation.intake_data = conversation.intake_data || {};
              conversation.intake_data.identity_notice_sent_at = new Date().toISOString();
              __stageMs.boleto_ms = Date.now() - __tBoleto;
              logPipelineTiming('neves_costa');
              return res.status(200).json({ success: true, neves_costa: true });
            }
          }
        }
        if (isBoleto) {
          const savedMsg = await saveMessage(conversation.id, boletoReply, 'ai', 'text', '', '', outMeta());
          const waMessageId = await sendWhatsAppMessage(from, boletoReply);
          if (savedMsg && waMessageId) {
            await supabase.from('messages').update({ wa_message_id: waMessageId, status: 'sent' }).eq('id', savedMsg.id);
          }
          conversation.intake_data = conversation.intake_data || {};
          conversation.intake_data.identity_notice_sent_at = new Date().toISOString();
          log('response_sent', { handler: 'boleto', replyLength: boletoReply?.length || 0 });
          __stageMs.boleto_ms = Date.now() - __tBoleto;
          logPipelineTiming('boleto');
          return res.status(200).json({ success: true, special: true });
        }
      }
      __stageMs.boleto_ms = Date.now() - __tBoleto;
      const __tIntake = Date.now();

      // ================= COLETA GUIADA DE INFORMAÇÕES =================
      if (conversation && messageType === 'text') {
        const lastBotMessage = activeMessages.slice().reverse().find(m => m.sender_type === 'ai');
        const lastReply = lastBotMessage ? lastBotMessage.text : '';
        log('intake_handler_invoked', { currentArea: conversation.legal_area || 'none', hasLastReply: !!lastReply });
        const intakeResult = await handleIntake(conversation, textBody, log, lastReply);
        if (intakeResult && intakeResult.reply) {
          // Enviar próxima pergunta do intake
          const savedMsg = await saveMessage(conversation.id, intakeResult.reply, 'ai', 'text', '', '', outMeta());
          const waMessageId = await sendWhatsAppMessage(from, intakeResult.reply);
          // Atualizar mensagem com wa_message_id e status
          if (savedMsg && waMessageId) {
            await supabase.from('messages').update({ wa_message_id: waMessageId, status: 'sent' }).eq('id', savedMsg.id);
          }
          log('response_sent', { handler: intakeResult.handler || 'intake', handoff: !!intakeResult.handoff, replyLength: intakeResult.reply?.length || 0 });
          __stageMs.intake_ms = Date.now() - __tIntake;
          logPipelineTiming(intakeResult.handler || 'intake');
          return res.status(200).json({ success: true, intake: true });
        }
      }
      __stageMs.intake_ms = Date.now() - __tIntake;

      // Boleto / Neves Costa já processado acima com prioridade sobre intake.

      // Resposta da IA para mídia
      let promptForAI = aiPromptText;
      let isMediaAudio = messageType === 'audio' || messageType === 'video';
      const isPlaceholderCaption = !textBody ||
        textBody === '[Áudio enviado]' ||
        textBody === '[Vídeo enviado]' ||
        textBody.startsWith('Documento:') ||
        textBody.startsWith('[Mensagem do tipo:');
      
      if (messageType !== 'text') {
        if (messageType === 'image' && !visionMedia) {
          // Sem mídia processada: o fallback é determinístico, sem pedir para "contar por texto"
          promptForAI = 'Não foi possível processar a imagem recebida.';
        } else if (isMediaAudio) {
          // Se for áudio/vídeo, tenta transcrever de forma assíncrona (sem bloquear resposta)
          if (publicUrl) {
            // Inicia transcrição em background (não aguarda). O deadline faz o
            // timeout do envio à Meta respeitar o tempo RESTANTE da invocação,
            // reservando margem para gravar 'unconfirmed' e fechar o áudio.
            const sendDeadline = __invocationStart + invocationBudgetMs() - sendReserveMs();
            // waitUntil registra a promise no runtime da Vercel: a invocação
            // permanece viva até resolver, em vez de depender de fire-and-forget.
            waitUntil(transcribeAudioAsync(conversation.id, publicUrl, messageType, inboundMessageId, sendDeadline).catch(err => {
              console.error('[WEBHOOK] Erro ao transcrever áudio em background:', err.message);
            }));
          }
          promptForAI = `Cliente enviou um ${messageType}. Diga: "Recebido! Estou analisando o áudio agora..." NUNCA mencione equipe, advogado ou retorno.`;
        } else if (messageType !== 'image' && textBody && !textBody.includes('processando transcrição') && !isPlaceholderCaption) {
          promptForAI = `O cliente enviou ${messageType} com a seguinte legenda/descrição: ${textBody}. Responda apenas sobre essa legenda, sem descrever ou inventar o conteúdo do arquivo.`;
        } else if (messageType !== 'image') {
          promptForAI = `Cliente enviou ${messageType}. Responda: "Recebido! Consegue descrever o conteúdo do arquivo?" NUNCA mencione equipe, advogado ou retorno.`;
        }
      }

      // Carregar memória do cliente para contexto
      const __tGemini = Date.now();
      const clientMemory = await loadClientMemory(conversation.id, from);
      const clientMemoryText = formatClientMemory(clientMemory);

      // Chamar Gemini com await (timeout de 15s)
      log('gemini_called', { hasHistory: !!conversationHistory, hasMemory: !!clientMemoryText });
      let aiReply;
      if (messageType === 'image' && !visionMedia) {
        aiReply = 'Não consegui baixar a imagem. Consegue descrever rapidamente o que aparece nela?';
        log('vision_failure_reason', { reason: 'vision_media_unavailable' });
      } else {
        try {
          aiReply = await askGemini(promptForAI, conversationHistory, conversation, log, visionMedia);
          if (visionMedia) {
            log('vision_response_generated', { responseLength: aiReply?.length || 0 });
          }
          aiReply = correctCommonMistakes(promptForAI, aiReply);
        } catch (visionError) {
          if (messageType === 'image') {
            log('vision_failure_reason', { reason: 'gemini_api_error' });
            aiReply = 'Não consegui analisar a imagem. Consegue descrever rapidamente o que aparece nela?';
          } else {
            throw visionError;
          }
        }
      }

      // Persistir fatos e última pergunta para o próximo turno, mantendo
      // o controle de repetição de forma sanitizada.
      if (conversation) {
        conversation.intake_data = conversation.intake_data || {};
        const q = getLastQuestionFromReply(aiReply);
        if (q) {
          conversation.intake_data.lastQuestion = { text: q.text, fingerprint: q.fingerprint };
          log('last_question_persisted', { fingerprint: q.fingerprint });
        } else {
          conversation.intake_data.lastQuestion = null;
        }
      }

      // Aviso LGPD controlado pelo código: exibido uma única vez, na primeira
      // interação (quando não consta no histórico nem foi registrado), junto com
      // a resposta ao assunto da mensagem. Se o próprio Gemini já incluiu o aviso,
      // não duplica. Recusa registrada impede reenvio.
      const lgpdAlreadySent = !!conversation?.intake_data?.consent_request_sent_at ||
        (activeMessages || []).some(m => m.sender_type === 'ai' && typeof m.text === 'string' && m.text.includes('politica-de-privacidade'));
      const consentDeclined = conversation?.intake_data?.consent_request_status === 'declined';
      if (conversation && !lgpdAlreadySent && !consentDeclined && !String(aiReply || '').includes('politica-de-privacidade')) {
        aiReply = `${LGPD_NOTICE}\n\n${aiReply}`;
        const lgpdIntakeData = { ...(conversation.intake_data || {}), consent_request_sent_at: new Date().toISOString() };
        const { error: lgpdError } = await supabase
          .from('conversations')
          .update({ intake_data: lgpdIntakeData })
          .eq('id', conversation.id);
        if (lgpdError) {
          log('lgpd_notice_persist_failed', { error: sanitizeError(lgpdError) });
        } else {
          conversation.intake_data = lgpdIntakeData;
          log('lgpd_notice_sent');
        }
      }

      log('ai_reply_generated', { length: aiReply?.length || 0 });
      __stageMs.gemini_ms = Date.now() - __tGemini;

      // Detectar se precisa de atendimento humano (somente pedido explícito)
      const needsHuman = detectNeedsHuman(textBody);
      if (needsHuman) {
        log('handoff_reason', { source: 'detectNeedsHuman' });
      }

      // Salvar resposta da IA
      let savedAiMsg = null;
      if (conversation) {
        savedAiMsg = await saveMessage(conversation.id, aiReply, 'ai', 'text', '', '', outMeta());
      }

      // Enviar resposta via WhatsApp ANTES de travar o canal para humano/notificar admin
      const aiWaMessageId = await sendWhatsAppMessage(from, aiReply);
      // Atualizar mensagem com wa_message_id e status
      if (savedAiMsg && aiWaMessageId) {
        await supabase.from('messages').update({ wa_message_id: aiWaMessageId, status: 'sent' }).eq('id', savedAiMsg.id);
      }
      log('response_sent', { handler: 'gemini', replyLength: aiReply?.length || 0 });
      logPipelineTiming('gemini');

      // Só depois do envio confirmado: notificar admin. NÃO marca mode='human'
      // aqui — um handoff automático não deve silenciar mensagens posteriores
      // sem confirmação de que um humano assumiu a conversa.
      if (needsHuman && conversation?.id) {
        await notifyAdminHandoff({ clientName, from, textBody, log });
      }
      
      // Retorna sucesso após processar tudo
      res.status(200).json({ success: true });
      return;
    } finally {
      if (conversation?.id) {
        try {
          conversation.intake_data = conversation.intake_data || {};
          conversation.intake_data.messageSequence = seqCounter;
          conversation.intake_data.lastProcessedAt = new Date().toISOString();
          await supabase.from('conversations').update({ intake_data: conversation.intake_data }).eq('id', conversation.id);
        } catch (persistErr) {
          log('conversation_state_persist_failed', { error: sanitizeError(persistErr) });
        }
      }
    }
  });
    return;
  } catch (error) {
      log.error('handler_exception', { error: sanitizeError(error), stack: error.stack });
      res.status(200).json({ success: false, error: error.message });
    }
  }
}

// Função para gerenciar coleta guiada de informações (intake) com triagem estruturada
// Mantém apenas a etiqueta legal_area como CONTEXTO para o Gemini.
// A conversa é conduzida pelo Gemini: esta função NÃO gera perguntas fixas,
// NÃO grava a mensagem em campos de formulário e NÃO emite resumo automático.
async function handleIntake(conversation, clientMessage, log = () => {}, lastReply = '') {
  const currentArea = conversation.legal_area;
  const detectedArea = detectArea(clientMessage);

  log('current_message_domain', { detectedArea: detectedArea || 'none', previousArea: currentArea || 'none' });

  // Mudança clara de assunto: atualiza apenas a etiqueta de área.
  // Histórico, intake_data e answers/fatos já coletados permanecem intactos.
  if (currentArea && detectedArea && detectedArea !== currentArea && !looksLikeAnswer(clientMessage) && hasStrongAreaSignal(detectedArea, clientMessage)) {
    log('domain_switch_detected', { previousArea: currentArea, newArea: detectedArea });
    if (conversation && supabase) {
      const { error: switchError } = await supabase
        .from('conversations')
        .update({ legal_area: detectedArea })
        .eq('id', conversation.id);
      if (switchError) {
        log('topic_reset_failed', { error: sanitizeError(switchError), reason: 'domain_switch' });
      } else {
        conversation.legal_area = detectedArea;
      }
    }
    return null;
  }

  // Primeira detecção de área: grava apenas a etiqueta (usada pelo Gemini como
  // contexto, não como ordem) e segue sem gerar perguntas de formulário.
  if (!currentArea && detectedArea) {
    if (conversation && supabase) {
      const { error } = await supabase
        .from('conversations')
        .update({ legal_area: detectedArea, funnel_stage: 'intake', case_type: clientMessage })
        .eq('id', conversation.id);
      if (!error) {
        conversation.legal_area = detectedArea;
      } else {
        log('area_label_persist_failed', { error: sanitizeError(error) });
      }
    }
    return null;
  }

  return null;
}

// Função para buscar ou criar conversa
async function getOrCreateConversation(phoneNumber, clientName) {
  if (!supabase) {
    console.warn('[SUPABASE] Cliente não configurado');
    return null;
  }

  const normalizedPhone = normalizePhoneForMatch(phoneNumber);
  const STALE_MS = 4 * 60 * 60 * 1000;

  const findLatestConversation = async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('client_phone_normalized', normalizedPhone)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    if (error) console.error('[SUPABASE] Erro ao buscar conversa:', sanitizeError(error));
    return data || null;
  };

  try {
    const existing = await findLatestConversation();

    if (existing) {
      const lastActivity = new Date(existing.updated_at || existing.created_at || 0).getTime();
      const isStale = Number.isFinite(lastActivity) && (Date.now() - lastActivity) > STALE_MS;
      if (isStale) {
        const resetIntake = { consent_request_status: 'pending', consent_request_sent_at: null, reset_at: new Date().toISOString() };
        const { data: reset, error: resetError } = await supabase
          .from('conversations')
          .update({
            intake_data: resetIntake,
            legal_area: null,
            case_type: null,
            status: 'open'
          })
          .eq('id', existing.id)
          .select()
          .single();
        if (!resetError && reset) {
          console.log(`[SUPABASE] Conversa reativada após ${Math.round((Date.now() - lastActivity) / 3600000)}h: ${reset.id}`);
          return reset;
        }
      }
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
        mode: 'bot',
        intake_data: { consent_request_status: 'pending', consent_request_sent_at: null }
      })
      .select()
      .single();

    if (createError) throw createError;
    console.log(`[SUPABASE] Nova conversa criada: ${newConv.id}`);
    return newConv;
  } catch (error) {
    // Se ocorrer conflito de telefone único, reutiliza a existente
    if (error.code === '23505') {
      const existing = await findLatestConversation();
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
    if (extraData.internal_note) insertData.internal_note = extraData.internal_note;
    if (extraData.created_at) insertData.created_at = extraData.created_at;

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

        if (minimalInsertData.direction === 'inbound') {
          await supabase.rpc('log_audit', {
            p_user_id: null,
            p_entity_type: 'whatsapp_message',
            p_entity_id: fallbackData.id,
            p_action: 'receive_message',
            p_old_value: null,
            p_new_value: 'received',
            p_details: JSON.stringify({ conversationId, contentType: messageType })
          });
        }

        return fallbackData;
      }

      throw error;
    }

    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      source: 'webhook',
      event: 'message_persisted',
      conversation_id_hash: hashIdentifier(conversationId),
      message_id_hash: hashIdentifier(data.id),
      wa_message_id_hash: hashIdentifier(waMessageId),
      direction,
      sender_type: senderType,
      message_type: messageType,
      media_type: insertData.media_type || null,
      text_present: !!text,
      media_url_present: !!mediaUrl,
      saved_at: new Date().toISOString()
    }));

    if (insertData.direction === 'inbound') {
      await supabase.rpc('log_audit', {
        p_user_id: null,
        p_entity_type: 'whatsapp_message',
        p_entity_id: data.id,
        p_action: 'receive_message',
        p_old_value: null,
        p_new_value: 'received',
        p_details: JSON.stringify({ conversationId, contentType: messageType })
      });
    }

    return data;
  } catch (error) {
    console.error('[SUPABASE] Erro ao salvar mensagem:', sanitizeError(error));
    return null;
  }
}

function normalizeForCheck(text) {
  return (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function looksLikeAnswer(text) {
  if (!text || typeof text !== 'string') return false;
  const n = normalizeForCheck(text).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  // Resposta a pergunta pendente: contém número, sim/não, afirmativa direta ou tempo/dado aproximado.
  if (/\b\d+\b/.test(n)) return true;
  if (/\b(sim|nao|não|claro|certo|isso|exato|exatamente|aproximadamente|ja|já|ainda nao|ainda não|não sei|nao sei|uns? \d+|metade|metade de)\b/.test(n)) return true;
  if (n.length <= 25 && /\b(ok|entendi|obrigado|obrigada|beleza|blz|fechado| combinado)\b/.test(n)) return true;
  return false;
}

// Sinal forte de mudança de assunto: evita trocar de área por substring/palavra
// isolada mencionada incidentalmente dentro de uma resposta. Forte quando há
// comando explícito de novo tema, >=2 palavras-chave da área detectada, keyword
// multi-palavra, ou a mensagem é uma pergunta sobre o novo tema.
const TOPIC_CHANGE_RE = /\b(quero falar|queria falar|quero tratar|vamos falar|falar sobre|falar de|outro assunto|outra duvida|mudando de assunto|trocando de assunto|agora (e|eh) sobre|tambem (tenho|queria|quero)|e sobre|e quanto a|aproveitando)\b/;

function hasStrongAreaSignal(area, message) {
  if (!area || !message) return false;
  const n = normalizeForCheck(message);
  if (!n) return false;
  if (TOPIC_CHANGE_RE.test(n)) return true;
  const flow = getFlow(area);
  const keywords = (flow && flow.triggerKeywords) || [];
  let hits = 0;
  let multiWordHit = false;
  for (const k of keywords) {
    const nk = normalizeForCheck(k);
    if (nk && n.includes(nk)) {
      hits++;
      if (nk.includes(' ')) multiWordHit = true;
    }
  }
  if (hits >= 2 || multiWordHit) return true;
  if (hits >= 1 && n.includes('?')) return true;
  // Verbo de intenção na 1ª pessoa + keyword da área = o novo tema é o assunto
  // da mensagem ("quero me divorciar", "preciso falar de aposentadoria"), não
  // uma menção incidental ("a empresa é ligada ao INSS").
  if (hits >= 1 && /\b(quero|queria|preciso|gostaria|tenho|estou|vim|sofri|recebi|vou|posso)\b/.test(n)) return true;
  return false;
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

const CANCEL_EXACT = new Set([
  'cancelar', 'cancela', 'cancele', 'sair', 'parar', 'pare', 'para', 'stop',
  'desistir', 'desisto', 'deixa', 'deixe', 'esquece', 'esqueça', 'esqueca',
  'nao quero mais', 'não quero mais', 'chega', 'ja deu', 'já deu', 'desliga', 'desligar'
]);

const PRIVACY_INTENT = [
  'nao aceito', 'não aceito', 'nao concordo', 'não concordo',
  'nao quero continuar', 'não quero continuar',
  'recuso', 'recusar', 'nao autorizo', 'não autorizo',
  'revogar', 'revogacao', 'revogação', 'revogo', 'revogue', 'quero revogar',
  'excluir', 'exclusao', 'exclusão', 'exclua', 'excluo', 'quero excluir',
  'apagar', 'apague', 'apago', 'apagamento',
  'deletar', 'delete', 'deleto',
  'quero apagar', 'quero deletar', 'direito de esquecimento',
  'oposicao', 'oposição', 'meu direito de opor',
  'retirar meu consentimento', 'retirar o consentimento', 'retirar consentimento',
  'retire meu consentimento', 'retire o consentimento', 'retire consentimento',
  'retiro meu consentimento', 'retiro o consentimento', 'retiro consentimento',
  'retirada do consentimento', 'retirada de consentimento',
  'tirar meu consentimento', 'tirar o consentimento', 'tirar consentimento',
  'cancelar meu consentimento', 'cancelar o consentimento', 'cancelar consentimento',
  'cancelo meu consentimento', 'cancelo o consentimento', 'cancelo consentimento'
];

function detectEscapeIntent(text) {
  if (!text || typeof text !== 'string') return null;
  const normalized = normalizeForCheck(text).replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  if (CANCEL_EXACT.has(normalized)) return 'cancel';
  const lower = normalized;
  if (EXPRESS_HUMAN_KEYWORDS.some(k => lower.includes(k))) return 'human';
  return null;
}

function isPrivacyIntent(text) {
  if (!text) return false;
  const normalized = normalizeForCheck(text).replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  return PRIVACY_INTENT.some(k => normalized.includes(k));
}

async function handlePrivacyRequest(conversation, textBody, from, req, extraData = {}) {
  if (!conversation?.intake_data || !isPrivacyIntent(textBody)) {
    return { handled: false };
  }

  const now = new Date().toISOString();
  const nextIntake = { ...(conversation.intake_data || {}) };

  // Registra o pedido de privacidade, mas evita duplicar log se já estiver declinado.
  if (conversation.intake_data.consent_request_status !== 'declined') {
    try {
      await supabase.from('consent_logs').insert({
        conversation_id: conversation.id,
        consent_type: 'data_processing',
        value: false,
        ip_address: (req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || null,
        user_agent: req?.headers?.['user-agent'] || null,
        created_at: now
      });
    } catch (err) {
      console.error('[PRIVACY] Erro ao registrar pedido:', sanitizeError(err));
    }
  }

  nextIntake.consent_request_status = 'declined';
  nextIntake.consent = false;
  nextIntake.privacy_request_at = now;
  nextIntake.consent_log = { type: 'data_processing', value: false, at: now };

  try {
    await supabase.from('conversations').update({ intake_data: nextIntake }).eq('id', conversation.id);
    conversation.intake_data = nextIntake;
  } catch (err) {
    console.error('[PRIVACY] Erro ao atualizar conversa:', sanitizeError(err));
  }

  const saved = await saveMessage(conversation.id, PRIVACY_REPLY, 'ai', 'text', '', '', extraData);
  const waId = await sendWhatsAppMessage(from, PRIVACY_REPLY);
  if (saved && waId) {
    await supabase.from('messages').update({ wa_message_id: waId, status: 'sent' }).eq('id', saved.id);
  }

  return { handled: true, declined: true };
}

async function handleConsent(conversation, textBody, from, req, extraData = {}) {
  if (!conversation?.intake_data) {
    return { handled: false };
  }

  const { consent_request_status: status, consent_request_sent_at: noticeAt } = conversation.intake_data;

  // Já aceito, recusado ou encerrado: não reprocessa.
  if (status && status !== 'pending') {
    return { handled: false };
  }

  const now = new Date().toISOString();
  const nextIntake = { ...(conversation.intake_data || {}) };

  // Recusa, revogação, exclusão ou oposição: aciona o fluxo de privacidade, mesmo no primeiro contato.
  if (isPrivacyIntent(textBody)) {
    const value = false;
    try {
      await supabase.from('consent_logs').insert({
        conversation_id: conversation.id,
        consent_type: 'data_processing',
        value,
        ip_address: (req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || null,
        user_agent: req?.headers?.['user-agent'] || null,
        created_at: now
      });
    } catch (err) {
      console.error('[CONSENT] Erro ao registrar recusa:', sanitizeError(err));
    }

    nextIntake.consent_request_status = 'declined';
    nextIntake.consent = value;
    nextIntake.consent_log = { type: 'data_processing', value, at: now };

    try {
      await supabase.from('conversations').update({ intake_data: nextIntake }).eq('id', conversation.id);
      conversation.intake_data = nextIntake;
    } catch (err) {
      console.error('[CONSENT] Erro ao atualizar conversa:', sanitizeError(err));
    }

    const saved = await saveMessage(conversation.id, PRIVACY_REPLY, 'ai', 'text', '', '', extraData);
    const waId = await sendWhatsAppMessage(from, PRIVACY_REPLY);
    if (saved && waId) {
      await supabase.from('messages').update({ wa_message_id: waId, status: 'sent' }).eq('id', saved.id);
    }
    return { handled: true, declined: true };
  }

  // Só registra aceite tácito depois que o aviso LGPD já foi enviado.
  // Não responde automaticamente; a conversa continua normalmente.
  if (noticeAt) {
    const value = true;
    try {
      await supabase.from('consent_logs').insert({
        conversation_id: conversation.id,
        consent_type: 'data_processing',
        value,
        ip_address: (req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || null,
        user_agent: req?.headers?.['user-agent'] || null,
        created_at: now
      });
    } catch (err) {
      console.error('[CONSENT] Erro ao registrar aceite:', sanitizeError(err));
    }

    nextIntake.consent_request_status = 'granted';
    nextIntake.consent = value;
    nextIntake.consent_log = { type: 'data_processing', value, at: now };

    try {
      await supabase.from('conversations').update({ intake_data: nextIntake }).eq('id', conversation.id);
      conversation.intake_data = nextIntake;
    } catch (err) {
      console.error('[CONSENT] Erro ao atualizar conversa:', sanitizeError(err));
    }

    return { handled: false, granted: true };
  }

  // Primeira mensagem sem recusa: deixa o fluxo principal enviar o aviso LGPD com a resposta.
  return { handled: false };
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



function isNevesCostaConfusion(text) {
  if (!text || !text.trim()) return false;
  const t = text.toLowerCase();
  const hasNevesCosta = /neves\s*costa|nevescosta/.test(t);
  const isCorrectFirm = /neves\s*([&e])\s*costa/.test(t);
  return hasNevesCosta && !isCorrectFirm;
}

async function sendNevesCostaImage(to, conversationId, imageUrl = NEVES_COSTA_IMAGE_URL, extraData = {}) {
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

    await saveMessage(conversationId, caption, 'ai', 'image', imageUrl, '', { ...extraData, media_type: 'image/jpeg' });

    console.log('[WEBHOOK] ✅ Imagem Neves Costa enviada');
    return true;
  } catch (error) {
    console.error('[WEBHOOK] ❌ Erro ao enviar imagem Neves Costa:', error.message);
    return false;
  }
}

// Gatilhos de identidade: somente frases que ATRIBUEM o boleto/cobrança/CNPJ ao
// escritório. "cnpj" e "boleto" isolados NÃO são gatilhos — aparecem
// legitimamente como objeto de casos cível/consumidor (ex: "processar a empresa
// pelo CNPJ do contrato", "boleto da compra veio com cobrança indevida").
// O texto é comparado após normalizeForCheck (sem acentos), por isso todas as
// chaves abaixo estão sem acentuação.
const IDENTITY_KEYWORDS = [
  'boleto de voces', 'boleto de vcs', 'boleto do escritorio', 'boleto que voces',
  'nome de voces', 'nome de vcs', 'emitido por voces', 'enviado por voces',
  'emitir boleto', 'emitido no meu nome', 'emitido em meu nome',
  'boleto no meu nome', 'boleto em meu nome',
  'voces emitiram', 'voces enviaram', 'voces mandaram', 'voces cobram', 'me cobraram',
  'cobranca de voces', 'cobranca de vcs', 'cobranca do escritorio',
  'cnpj de voces', 'cnpj de vcs', 'cnpj do escritorio',
  'seu cnpj', 'qual o cnpj', 'qual e o cnpj',
  'advocacia neves costa', 'neves costa', 'outro escritorio',
  'negociacao de divida'
];

const IDENTITY_ALREADY_SAID = [
  'não possuímos cnpj', 'não possuimos cnpj', 'não possuirmos cnpj', 'não emitimos boletos',
  'não emite boletos', 'não fazemos cobranças', 'não temos relação',
  'sem relação com a', 'não temos relacao', 'neves & costa', 'advocacia neves costa',
  'não emitimos', 'não fazemos cobrança'
];

function getSpecialReply(text, clientName, history = '', log = () => {}) {
  const lower = normalizeForCheck(text);
  const historyLower = normalizeForCheck(history);

  if (isMarketingMessage(text)) return 'NO_REPLY';

  if (detectThanks(text)) {
    return getThanksReply();
  }

  const isIdentity = IDENTITY_KEYWORDS.some(k => lower.includes(k));
  const alreadySaid = IDENTITY_ALREADY_SAID.some(s => historyLower.includes(s));

  log('boleto_handler_selected', { isIdentity: !!isIdentity, alreadySaid: !!alreadySaid });

  if (isIdentity) {
    const name = getClientGreeting(clientName);
    if (alreadySaid) {
      return `${name}, confira a grafia exata e o CNPJ do documento: a Neves & Costa Advocacia, com "&", não emite boletos nem faz cobranças.`;
    }
    return `${name}, a Neves & Costa Advocacia (com "&") não emitimos boletos, não fazemos cobranças, não possuímos CNPJ e não temos relação com a "Advocacia Neves Costa" sem o "&".`;
  }

  return null;
}

// Aviso LGPD exibido pelo código na primeira interação (mesmo texto do SYSTEM_PROMPT).
const LGPD_NOTICE = `Olá! Seja bem-vindo(a) à Neves & Costa Advocacia e Consultoria. Meu nome é Jhon, assistente virtual do escritório.

Em conformidade com a LGPD, os dados fornecidos nesta conversa serão tratados com sigilo e utilizados exclusivamente para o atendimento solicitado. Ao continuar a conversa, você concorda com esse tratamento. Consulte nossa Política de Privacidade: https://chatnevesecosta.vercel.app/politica-de-privacidade

Como posso ajudar?`;

const PRIVACY_REPLY = 'Seu pedido de retirada do consentimento foi registrado. A retirada não invalida os tratamentos realizados anteriormente, e alguns dados poderão ser mantidos quando houver obrigação legal.';



function queryKeywords(query) {
  const stopwords = new Set(['o','a','os','as','um','uma','de','da','do','das','dos','e','em','no','na','nos','nas','por','para','com','como','mais','menos','muito','pouco','se','sem','sob','sobre','entre','ate','antes','depois','durante','so','que','quem','qual','quais','cujo','cuja','este','esta','estes','estas','esse','essa','esses','essas','aquele','aquela','aqueles','aquela','isto','isso','aquilo','meu','minha','meus','minhas','teu','tua','teus','tuas','seu','sua','seus','suas','nosso','nossa','nos','vos','lhes','lhe','la','aqui','agora','hoje','ontem','amanha','ja','ainda','so','somente','talvez','deve','dever','deveria','pode','poder','posso','ser','estar','ter','haver','fazer','dar','dizer','ver','ir','vir','sair','chegar','ficar','passar','voltar','entrar','comecar','acabar','terminar','continuar','parecer','achar','sendo','sido','gere','gerar','rascunho','inicial','dê','me','nos','favor','obrigado','obrigada','fico','grato','gostaria','poderia','pode','faca','faz','diga','qualquer','todos','todas','todo','toda','cada','tanto','tanta','sempre','nunca','jamais','nem','tambem','ou','mas','porem','contudo','entretanto','logo','portanto','assim','pois','porque','porquê','quando','onde','quanto','quantos','exemplo','tipo','dessa','desse','daquele','disto','disso','daquilo','nele','nela','dele','dela','pro','pra','pros','pras','eu','voce','você','ele','ela','eles','elas']);
  return (query || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]+/g) || []
    .filter(t => t.length >= 3 && !stopwords.has(t));
}

function isRelevantChunk(query, chunk) {
  const keywords = queryKeywords(query);
  if (keywords.length === 0) return false;
  const haystack = ((chunk.title || '') + ' ' + (chunk.content || ''))
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return keywords.some(k => haystack.includes(k));
}

async function getKnowledgeContext(prompt, log = () => {}) {
  if (!supabase || prompt.length < 15) return '';
  try {
    const { chunks } = await semanticSearch(supabase, { query: prompt, topK: 3, minRank: 0.45 });
    const relevantChunks = (chunks || []).filter(c => isRelevantChunk(prompt, c));
    log('rag_filter_result', { retrieved: (chunks || []).length, relevant: relevantChunks.length });
    if (!relevantChunks.length) return '';
    const block = relevantChunks.slice(0, 2).map(c => `FONTE: ${c.title} (${c.type})\n${c.content}`).join('\n---\n');
    log('relevant_document_count', { count: relevantChunks.length });
    return `DOCUMENTOS RELEVANTES (use apenas se forem diretamente pertinentes; caso contrário, ignore):\n${block}\n\n`;
  } catch {
    return '';
  }
}

// RAG só roda quando a mensagem sinaliza necessidade concreta de base
// normativa, documento, modelo, procedimento ou prazo — não em toda narrativa,
// pergunta genérica ou menção a processo/acordo.
const KNOWLEDGE_TRIGGER_RE = /\b(documento|documentos|prazo|prazos|lei|artigo|jurisprudencia|recurso|recorrer|modelo|modelos|requerimento|peticao|petição|procedimento|procedimentos|honorarios?|honorários?|quanto custa|tabela|oab)\b/;

function shouldUseKnowledge(text) {
  if (!text || text.length < 15) return false;
  const n = normalizeForCheck(text);
  return KNOWLEDGE_TRIGGER_RE.test(n);
}

// Extrai fatos sólidos da mensagem atual, mesclando com os já confirmados.
// Não grava no banco — devolve um objeto leve para o prompt.
function extractConfirmedFacts(text, existing = {}) {
  const t = String(text || '').trim();
  if (!t) return existing || {};
  const facts = { ...existing };

  // Número processual (CNJ)
  const cnj = t.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
  if (cnj) facts.processNumber = cnj[0];

  // Nome da representante
  const nameMatch = t.match(/(?:me chamo|meu nome [ée]|sou)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})/i);
  if (nameMatch && !facts.representative) facts.representative = nameMatch[1].trim();

  // Escritório ("do escritório X" / "escritório X")
  const officeMatch = t.match(/(?:do escrit[óo]rio|do[me]?\s+escrit[óo]rio)\s+([A-Z][^\.,;]{2,50})/i) ||
    t.match(/escrit[óo]rio\s+([A-Z][^\.,;]{2,50})/i);
  if (officeMatch && !facts.office) facts.office = officeMatch[1].trim().replace(/\s+$/, '');

  // Empresa / credor
  const companyMatch = t.match(/(?:empresa|representamos a(?:\s+empresa)?)\s+([A-Z][^\.,;]{2,60})/i);
  if (companyMatch && !facts.company) facts.company = companyMatch[1].trim().replace(/\s+$/, '');

  // Objetivo atual
  if (/acordo\s+parcelado?/i.test(t) || (/acordo/i.test(t) && /parcela/i.test(t)) || /pagamento\s+parcelado/i.test(t)) {
    facts.objective = 'acordo parcelado';
  } else if (/acordo/i.test(t) && !facts.objective) {
    facts.objective = 'acordo';
  }

  return facts;
}

function questionFingerprint(text) {
  const n = String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!n) return null;
  return crypto.createHash('sha256').update(n).digest('hex').slice(0, 16);
}

function buildUserPrompt({ currentText, conversationHistory, knowledgeBlock, facts, lastQuestion }) {
  const blocks = [];

  const factLines = [];
  if (facts) {
    if (facts.representative) factLines.push(`- Representante: ${facts.representative}`);
    if (facts.office) factLines.push(`- Escritório: ${facts.office}`);
    if (facts.company) factLines.push(`- Empresa/Credor: ${facts.company}`);
    if (facts.processNumber) factLines.push(`- Número do processo: ${facts.processNumber}`);
    if (facts.objective) factLines.push(`- Objetivo: ${facts.objective}`);
  }

  if (factLines.length > 0) {
    blocks.push(`FATOS CONFIRMADOS:\n${factLines.join('\n')}`);
    if (facts.objective) {
      blocks.push(`OBJETIVO ATUAL: ${facts.objective}`);
    }
  }

  // Histórico só entra quando ainda não há fatos robustos o suficiente.
  const hasProcessFacts = !!(facts && (facts.company || facts.processNumber));
  if (conversationHistory && !hasProcessFacts) {
    blocks.push(`HISTÓRICO DAS ÚLTIMAS MENSAGENS:\n${conversationHistory}`);
  }

  if (knowledgeBlock) {
    blocks.push(knowledgeBlock);
  }

  if (lastQuestion && lastQuestion.text) {
    blocks.push(`ÚLTIMA PERGUNTA DO ASSISTENTE: ${lastQuestion.text}`);
  }

  blocks.push(`MENSAGEM ATUAL: ${currentText}`);
  return blocks.filter(Boolean).join('\n\n');
}

function getLastQuestionFromReply(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const hasQuestion = /\?/.test(t) || /\b(qual|quais|quanto|quantos|quanta|como|onde|quem|por que|porque|porquê)\b/i.test(t);
  if (!hasQuestion) return null;
  const fingerprint = questionFingerprint(t);
  const sanitized = t.replace(/\d[\d\.\-\/]+/g, '___').slice(0, 160);
  return { text: sanitized, fingerprint };
}

async function askGemini(prompt, conversationHistory = '', conversation = null, log = () => {}, mediaData = null) {
  // Prepara fatos e sinais de conhecimento antes de qualquer await, para que
  // o fallback também tenha acesso ao knowledgeBlock.
  const previousFacts = (conversation && conversation.intake_data && conversation.intake_data.confirmedFacts) || {};
  const facts = extractConfirmedFacts(prompt, previousFacts);
  if (conversation) {
    conversation.intake_data = conversation.intake_data || {};
    conversation.intake_data.confirmedFacts = facts;
  }

  // Em contexto trabalhista, a base de conhecimento não é injetada:
  // evita poluir o modelo com peças de outras áreas (consumidor, bancário).
  const hasActiveLaborContext = (conversation?._laborCalculation || conversation?.intake_data?.laborCalculation) &&
    conversation?.intake_data?.laborContextActive !== false;
  const isLaborContext = hasActiveLaborContext ||
    classifyLaborIntent(prompt).intent !== 'other';
  const wantsKnowledge = !isLaborContext && shouldUseKnowledge(prompt);
  let knowledgeBlock = '';
  const lastQuestion = conversation?.intake_data?.lastQuestion || null;

  try {
    console.log('[GEMINI] Tentando Gemini 2.5 Flash-Lite...');
    console.log('[GEMINI] API Key presente?', GEMINI_API_KEY ? 'Sim' : 'NÃO');

    if (wantsKnowledge) {
      knowledgeBlock = await getKnowledgeContext(prompt, log);
    }
    const useKnowledge = wantsKnowledge && !!knowledgeBlock;
    log(useKnowledge ? 'rag_called' : 'rag_skipped', {
      reason: isLaborContext ? 'labor_context' : (wantsKnowledge ? (knowledgeBlock ? 'relevant_chunks' : 'irrelevant_results') : 'no_knowledge_signal')
    });

    const fullPrompt = buildUserPrompt({
      currentText: prompt,
      conversationHistory,
      knowledgeBlock,
      facts,
      lastQuestion
    });

    const primaryParts = [{ text: fullPrompt }];
    if (mediaData) {
      primaryParts.push({
        inline_data: {
          mime_type: mediaData.mimeType,
          data: mediaData.base64
        }
      });
    }

    // Observabilidade do contexto: o que realmente orienta esta resposta.
    const contextSources = [];
    if (clientMemoryText) contextSources.push('client_memory_history');
    if (conversationHistory) contextSources.push('recent_messages');
    if (Object.keys(facts || {}).length) contextSources.push('confirmed_facts');
    if (knowledgeBlock) contextSources.push('knowledge');
    log('context_sources', { sources: contextSources });
    log('trusted_facts_count', { count: Object.keys(facts || {}).length });

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
            parts: primaryParts
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
    // Fallback recebe o mesmo bloco do prompt para manter contexto
    const fallbackPrompt = buildUserPrompt({
      currentText: prompt,
      conversationHistory,
      knowledgeBlock,
      facts,
      lastQuestion
    });

    const fallbackParts = [{ text: fallbackPrompt }];
    if (mediaData) {
      fallbackParts.push({
        inline_data: {
          mime_type: mediaData.mimeType,
          data: mediaData.base64
        }
      });
    }

    const response = await fetch(GEMINI_API_URL_FALLBACK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [
          {
            parts: fallbackParts
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
    const waMessageId = data.messages?.[0]?.id;
    console.log(`[WHATSAPP] ✅ Mensagem enviada com sucesso. ID: ${waMessageId}`);
    return waMessageId; // Retornar o ID da mensagem
  } catch (error) {
    console.error(`[WHATSAPP] ❌ Erro ao enviar mensagem: ${error.message}`);
    throw error;
  }
}

// Transcrição assíncrona de áudio (não bloqueia resposta do webhook)
// Orçamento da invocação para envio de mídia assíncrona: espelha o
// maxDuration de 60s do vercel.json; env ausente/inválida cai no default e
// valores excessivos são limitados ao teto — se o maxDuration do vercel.json
// for reduzido no futuro, ajustar MAX_INVOCATION_BUDGET_MS aqui também.
// Não é proteção absoluta contra encerramento de infraestrutura.
const MAX_INVOCATION_BUDGET_MS = 60000;
const invocationBudgetMs = () => {
  const n = Number(process.env.WEBHOOK_INVOCATION_BUDGET_MS);
  const configured = Number.isFinite(n) && n > 0 ? n : MAX_INVOCATION_BUDGET_MS;
  return Math.min(configured, MAX_INVOCATION_BUDGET_MS);
};
// Margem reservada antes do fim do orçamento para gravar 'unconfirmed' e
// fechar o media_status do áudio.
const sendReserveMs = () => {
  const n = Number(process.env.WHATSAPP_SEND_RESERVE_MS);
  return Number.isFinite(n) && n > 0 ? n : 5000;
};

async function transcribeAudioAsync(conversationId, mediaUrl, mediaType, messageId = null, sendDeadline = null) {
  // Reivindicação atômica: só quem mudar pending->processing continua.
  // Evita corrida com o sweeper /api/process-media sobre o mesmo áudio.
  // Transição final condicional à posse: só grava se o áudio ainda está em
  // 'processing' (claimer atual). Se o estado mudou externamente (ex.:
  // needs_review), a escrita retorna 0 linhas e o valor atual é preservado.
  const setAudioStatus = async (status, extra = {}) => {
    if (!messageId) return true;
    const { data, error } = await supabase
      .from('messages')
      .update({ media_status: status, ...extra })
      .eq('id', messageId)
      .eq('media_status', 'processing')
      .select('id');
    if (error) {
      console.error(`[WEBHOOK] Falha ao gravar media_status=${status} do áudio:`, sanitizeError(error));
      return false;
    }
    if (!data || data.length === 0) {
      console.log(`[WEBHOOK] media_status do áudio não gravado (${status}): estado alterado externamente, mantendo valor atual`);
      return false;
    }
    return true;
  };

  let replyInserted = false;
  // 'skipped' = envio nunca tentado (orçamento esgotado antes do fetch);
  // 'unconfirmed' = fetch iniciado sem confirmação da Meta (entrega incerta).
  let replySendState = null;
  try {
    console.log(`[WEBHOOK] Iniciando transcrição assíncrona para conversa ${conversationId}`);

    if (messageId) {
      const { data: claimed, error: claimError } = await supabase
        .from('messages')
        .update({ media_status: 'processing' })
        .eq('id', messageId)
        .eq('media_status', 'pending')
        .select('id');
      if (claimError) {
        console.error('[WEBHOOK] Erro ao reivindicar áudio:', sanitizeError(claimError));
        return;
      }
      if (!claimed || claimed.length === 0) {
        console.log('[WEBHOOK] Áudio já reivindicado por outro processo, ignorando');
        return;
      }
    }

    const mimeType = mediaType === 'audio' ? 'audio/ogg' : 'video/mp4';
    const transcript = await transcribeAudio(mediaUrl, mimeType);

    if (!transcript) {
      console.log('[WEBHOOK] Transcrição retornou vazia');
      await setAudioStatus('failed');
      return;
    }

    // Persiste a transcrição imediatamente (condicional à posse): se a lambda
    // morrer mais adiante no envio à Meta, a transcrição não se perde.
    await setAudioStatus('processing', { media_transcript: transcript });

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

    const wasHuman = conversation.mode === 'human';
    if (wasHuman) {
      console.log('[WEBHOOK] Conversa em modo humano, mas áudio pendente será respondido para não perder a resposta gerada');
    }

    // Busca histórico recente (máximo 4h)
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { data: messages } = await supabase
      .from('messages')
      .select('text, sender_type, created_at')
      .eq('conversation_id', conversationId)
      .gte('created_at', fourHoursAgo)
      .order('created_at', { ascending: true });

    const conversationHistory = messages?.slice(-50).map(m => {
      const role = m.sender_type === 'client' ? 'Cliente' : 'Jhon';
      const time = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `[${time}] ${role}: ${m.text}`;
    }).join('\n') || '';

    const prompt = `O cliente enviou um áudio com a seguinte transcrição:\n\n"${transcript}"\n\nResponda de forma breve, objetiva e educada como se estivesse respondendo diretamente ao cliente. NUNCA mencione que é uma transcrição.`;

    // O pipeline trabalhista também se aplica ao áudio transcrito: extração,
    // cálculo determinístico e respostas de valor nunca passam pelo Gemini.
    const audioLog = (event, data) => console.log(`[LABOR] ${event}`, JSON.stringify(data || {}));
    let aiReply = null;
    try {
      const normalizedPhone = normalizePhoneForMatch(conversation.client_phone || '');
      const laborResult = await laborIntegration.handleLaborSettlementWebhook({
        conversation,
        normalizedPhone,
        waMessageId: null,
        textBody: transcript,
        messageType: 'text',
        messages: messages || [],
        log: audioLog
      });
      if (laborResult && laborResult.calculation && laborResult.calculation.totalEstimated != null) {
        try {
          const calc = laborResult.calculation;
          const laborCalculation = {
            totalEstimated: calc.totalEstimated,
            currency: calc.currency || 'BRL',
            calculatedAt: new Date().toISOString(),
            items: (calc.items || []).map(i => ({ code: i.code, name: i.name, amount: i.amount, status: i.status }))
          };
          conversation._laborCalculation = laborCalculation;
          const nextIntakeData = { ...(conversation.intake_data || {}), laborCalculation, laborContextActive: true };
          delete nextIntakeData.laborContextResetAt;
          const { data, error: laborCalcUpdateError } = await supabase
            .from('conversations')
            .update({ intake_data: nextIntakeData })
            .eq('id', conversation.id)
            .select();
          if (laborCalcUpdateError) {
            audioLog('labor_calculation_persist_failed', { error: sanitizeError(laborCalcUpdateError) });
          } else {
            conversation.intake_data = nextIntakeData;
            audioLog('labor_calculation_persisted', { success: true, itemsCount: laborCalculation.items.length });
          }
        } catch (err) {
          audioLog('labor_calculation_persist_failed', { error: sanitizeError(err) });
        }
      }
      if (laborResult && laborResult.handled && laborResult.reply) {
        aiReply = laborResult.reply;
      }
    } catch (err) {
      audioLog('labor_integration_exception', { error: sanitizeError(err) });
    }

    if (!aiReply) {
      console.log('[WEBHOOK] Gerando resposta automática para áudio');
      const { askGemini } = await import('../../lib/ai.js');
      aiReply = await askGemini(prompt, conversationHistory, conversation);
    }

    // Salva resposta no banco com vínculo ao áudio de origem (sem nova coluna:
    // reutiliza internal_note/meta, mesmo padrão já usado pelo projeto)
    const { data: savedReply, error: saveError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        text: aiReply,
        sender_type: 'bot',
        direction: 'outbound',
        content_type: 'text',
        internal_note: messageId ? buildMessageMeta({ sourceMessageId: messageId }) : undefined
      })
      .select('id')
      .single();

    if (saveError) {
      console.error('[WEBHOOK] Erro ao salvar resposta de áudio:', sanitizeError(saveError));
      // Falha transitória antes do envio: devolve para pending para o sweeper
      await setAudioStatus('pending');
      return;
    }
    replyInserted = true;

    // Envia resposta via WhatsApp ANTES de qualquer retorno por modo humano
    const { sendWhatsAppMessage } = await import('../../lib/whatsapp.js');
    try {
      const replyWaId = await sendWhatsAppMessage(conversation.client_phone, aiReply, { deadline: sendDeadline });
      if (savedReply?.id) {
        // Meta confirmou o envio (response.ok); wa_message_id vincula callbacks
        await supabase
          .from('messages')
          .update({ ...(replyWaId ? { wa_message_id: replyWaId } : {}), status: 'sent' })
          .eq('id', savedReply.id);
      }
      console.log(`[WEBHOOK] ✅ Resposta automática enviada para áudio`);
    } catch (sendError) {
      if (sendError?.code === 'SEND_SKIPPED_NO_BUDGET') {
        // Envio NUNCA tentado (orçamento esgotado antes do fetch): não é
        // "entrega incerta" — é certo que não saiu. not_sent impede retry
        // automático e exige revisão; o áudio vira needs_review.
        replySendState = 'skipped';
        console.error('[WEBHOOK] Resposta de áudio não enviada (orçamento da invocação esgotado):', sanitizeError(sendError));
        if (savedReply?.id) {
          await supabase
            .from('messages')
            .update({ status: 'not_sent' })
            .eq('id', savedReply.id);
        }
      } else {
        // Intervalo incerto: a Meta pode ter recebido. Não reenviar — marca o
        // registro como unconfirmed para o operador decidir.
        replySendState = 'unconfirmed';
        console.error('[WEBHOOK] Envio da resposta de áudio sem confirmação:', sanitizeError(sendError));
        if (savedReply?.id) {
          await supabase
            .from('messages')
            .update({ status: 'unconfirmed' })
            .eq('id', savedReply.id);
        }
      }
    }

    // Envio nunca tentado → needs_review (operador decide); enviado ou
    // incerto → processed (pipeline de mídia concluído).
    await setAudioStatus(replySendState === 'skipped' ? 'needs_review' : 'processed', { media_transcript: transcript });

    // Só depois do envio: pedido explícito de humano no áudio notifica o admin.
    // NÃO marca mode='human' — handoff automático não deve silenciar a conversa
    // sem confirmação de que um humano assumiu.
    if (!wasHuman) {
      const needsHuman = detectNeedsHuman(transcript);
      if (needsHuman) {
        await notifyAdminHandoff({
          clientName: conversation.client_name,
          from: conversation.client_phone,
          textBody: transcript,
          log: console
        });
      }
    }
  } catch (error) {
    console.error('[WEBHOOK] Erro na transcrição assíncrona:', error.message);
    if (messageId) {
      // Se a resposta já foi inserida/enviada (ou incerta), não marcar pending:
      // reprocessar geraria resposta duplicada. Caso contrário, devolve ao
      // sweeper como falha transitória. Envio nunca tentado → needs_review.
      try {
        await setAudioStatus(replySendState === 'skipped' ? 'needs_review' : (replyInserted ? 'processed' : 'pending'));
      } catch (_) {}
    }
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

    console.log(`[MEDIA] Mídia baixada: tipo=${mimeType}, tamanho=${buffer.length} bytes`);
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
      if (error) {
        console.log(`[WEBHOOK] 📬 Erro de entrega: ${error.code} - ${error.title}`);
      }

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

// Hooks de teste (não afetam a rota; Next usa apenas o default export)
export const __test__ = { transcribeAudioAsync, processDeliveryStatuses };

