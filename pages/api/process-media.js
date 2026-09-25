import { createClient } from '@supabase/supabase-js';
import { transcribeAudio, summarizeMedia } from '../../lib/mediaProcessing';
import { sanitizeError } from '../../lib/webhookLog';
import { askGemini } from '../../lib/ai';
import { sendWhatsAppMessage } from '../../lib/whatsapp';
import { detectNeedsHuman, notifyAdminHandoff } from '../../lib/needsHuman.js';
import { buildMessageMeta } from '../../lib/messageMeta';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_SECRET = process.env.MEDIA_PROCESS_SECRET;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

// Número máximo de mensagens por execução para evitar timeout na Vercel
const BATCH_SIZE = 5;
// Registros 'processing' mais antigos que isso são considerados órfãos
// (o processo que os reivindicou morreu antes de concluir).
const STALE_PROCESSING_MINUTES = 15;

export default async function handler(req, res) {
  console.log(`[MEDIA_PROCESS] Requisição ${req.method}`);

  // Proteção simples: permite chamada manual com header ou cron sem secret caso não configurado
  const secret = req.headers['x-media-secret'];
  if (API_SECRET && secret !== API_SECRET) {
    console.warn('[MEDIA_PROCESS] Acesso negado: secret inválido');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    console.error('[MEDIA_PROCESS] Supabase não configurado');
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    // Recuperação de órfãos: 'processing' antigos voltam a 'pending' via
    // update condicional (idempotente). O claim pending->processing abaixo
    // garante atomicamente que apenas um processo envia a resposta.
    const staleCutoff = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000).toISOString();
    const { data: staleProcessing } = await supabase
      .from('messages')
      .select('id')
      .in('content_type', ['audio', 'video', 'image', 'document'])
      .eq('media_status', 'processing')
      .lt('created_at', staleCutoff)
      .limit(BATCH_SIZE);

    for (const stale of staleProcessing || []) {
      console.log(`[MEDIA_PROCESS] Órfão em processing há mais de ${STALE_PROCESSING_MINUTES}min, devolvendo à fila: ${stale.id}`);
      await supabase
        .from('messages')
        .update({ media_status: 'pending' })
        .eq('id', stale.id)
        .eq('media_status', 'processing');
    }

    // Busca mídias pendentes (áudio e vídeo primeiro; imagem/documento como secundário)
    const { data: pendingMessages, error: fetchError } = await supabase
      .from('messages')
      .select('id, conversation_id, content_type, media_url, text, created_at')
      .in('content_type', ['audio', 'video', 'image', 'document'])
      .eq('media_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('[MEDIA_PROCESS] Erro ao buscar mídias pendentes:', sanitizeError(fetchError));
      return res.status(500).json({ error: 'Erro ao buscar mídias' });
    }

    if (!pendingMessages || pendingMessages.length === 0) {
      console.log('[MEDIA_PROCESS] Nenhuma mídia pendente');
      return res.status(200).json({ success: true, processed: 0 });
    }

    console.log(`[MEDIA_PROCESS] ${pendingMessages.length} mídias pendentes encontradas`);

    const results = [];
    const startTime = Date.now();
    const TIME_LIMIT_MS = 8000; // 8s para deixar margem antes dos 10s da Vercel

    for (const message of pendingMessages) {
      if (Date.now() - startTime > TIME_LIMIT_MS) {
        console.log('[MEDIA_PROCESS] Tempo limite próximo, interrompendo lote');
        break;
      }

      const { id, content_type, media_url, text } = message;
      if (!media_url) continue;

      // Reivindicação atômica: o update condicional pending->processing só
      // retorna linha para um único processo. Sem isso, o webhook assíncrono
      // e este cron podem transcrever/responder o mesmo áudio duas vezes.
      const { data: claimed, error: claimError } = await supabase
        .from('messages')
        .update({ media_status: 'processing' })
        .eq('id', id)
        .eq('media_status', 'pending')
        .select('id');

      if (claimError) {
        console.error(`[MEDIA_PROCESS] Erro ao reivindicar mensagem ${id}:`, sanitizeError(claimError));
        continue;
      }
      if (!claimed || claimed.length === 0) {
        console.log(`[MEDIA_PROCESS] Mensagem ${id} já reivindicada por outro processo, pulando`);
        continue;
      }

      const mimeType = getMimeFromUrl(media_url) || `audio/ogg`;
      let transcript = '';
      let summary = '';
      let status = 'processed';

      try {
        if (content_type === 'audio' || content_type === 'video') {
          console.log(`[MEDIA_PROCESS] Transcrevendo mensagem ${id}`);
          transcript = await transcribeAudio(media_url, mimeType);
          console.log(`[TRANSCRIPTION] Mensagem ${id}, comprimento: ${transcript?.length || 0}`);

          if (transcript) {
            summary = await generateBriefSummary(transcript);
          }
        } else if (content_type === 'image' || content_type === 'document') {
          console.log(`[MEDIA_PROCESS] Resumindo mensagem ${id}`);
          summary = await summarizeMedia(media_url, mimeType);
        }
      } catch (processError) {
        console.error(`[MEDIA_PROCESS] Erro ao processar mensagem ${id}:`, processError.message);
        status = 'failed';
      }

      // Dedupe ANTES de gravar o status final: só 'linked' é prova confiável de
      // resposta enviada. Candidatos ambíguos (janela temporal sem vínculo)
      // marcam needs_review — nunca presumimos respondido.
      let replyDisposition = null;
      if ((content_type === 'audio' || content_type === 'video') && transcript && status === 'processed') {
        replyDisposition = await findExistingReply(message);
        if (replyDisposition === 'ambiguous') {
          console.log(`[MEDIA_PROCESS] Mensagem ${id}: resposta ambígua, marcando needs_review`);
          status = 'needs_review';
        }
      }

      // Monta texto visível: preserva a legenda/caption original se houver
      const caption = text && !text.includes('processando transcrição') ? text : '';
      const newText = transcript
        ? `[Áudio transcrito]: ${transcript}${caption ? '\n\nLegenda: ' + caption : ''}`
        : (caption || text || `[Mídia ${content_type} recebida]`);

      const updatePayload = {
        media_status: status,
        media_transcript: transcript || null,
        media_summary: summary || null,
        text: newText
      };

      const { error: updateError } = await supabase
        .from('messages')
        .update(updatePayload)
        .eq('id', id);

      if (updateError) {
        console.error(`[MEDIA_PROCESS] Erro ao salvar mensagem ${id}:`, sanitizeError(updateError));
      } else {
        console.log(`[MEDIA_PROCESS] Mensagem ${id} processada: status=${status}`);
        results.push({ id, content_type, status });

        // Responde o cliente somente quando não há resposta associada.
        // 'linked' → reconcilia sem reenviar; 'ambiguous' → já virou
        // needs_review acima; 'none' → nenhuma resposta, pode enviar.
        if (replyDisposition === 'linked') {
          console.log(`[MEDIA_PROCESS] Mensagem ${id} já tem resposta associada, reconciliando sem reenviar`);
        } else if (replyDisposition === 'none' && status === 'processed') {
          try {
            await replyToClient(message, transcript, summary);
          } catch (replyError) {
            console.error(`[MEDIA_PROCESS] Erro ao responder cliente da mensagem ${id}:`, replyError.message);
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      processed: results.length,
      results
    });
  } catch (error) {
    console.error('[MEDIA_PROCESS] Erro geral:', error.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
}

function getMimeFromUrl(url) {
  if (!url) return null;
  const ext = url.split('.').pop().toLowerCase();
  const map = {
    ogg: 'audio/ogg',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    mpeg: 'video/mpeg',
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp'
  };
  return map[ext] || null;
}

// Classifica a existência de resposta do bot para a mídia:
// 'linked'    — vínculo exato via internal_note (source_message_id). Prova confiável.
// 'ambiguous' — existe texto do bot na janela de 15min, sem vínculo: pode ser a
//               resposta deste áudio ou de outro próximo. Não é prova → revisão.
// 'none'      — nenhuma resposta; a mídia provavelmente nunca foi respondida.
async function findExistingReply(message) {
  if (!supabase || !message?.id) return 'none';
  try {
    const { data: linked, error: linkError } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', message.conversation_id)
      .eq('direction', 'outbound')
      .eq('sender_type', 'bot')
      .like('internal_note', `%${message.id}%`)
      .limit(1);

    if (linkError) {
      console.error('[MEDIA_PROCESS] Erro ao verificar resposta vinculada:', sanitizeError(linkError));
      return 'ambiguous'; // sem prova, não reenviar
    }
    if (linked && linked.length > 0) return 'linked';

    // Legado sem vínculo: procura resposta na janela EXCLUINDO as confirmações
    // automáticas ("Recebido! Estou analisando...") — elas não são resposta final.
    const windowEnd = new Date(new Date(message.created_at).getTime() + 15 * 60 * 1000).toISOString();
    const { data: candidates, error: candError } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', message.conversation_id)
      .eq('direction', 'outbound')
      .eq('sender_type', 'bot')
      .gt('created_at', message.created_at)
      .lt('created_at', windowEnd)
      .not('text', 'ilike', '%analisando%')
      .not('text', 'ilike', '%Recebido!%')
      .limit(1);

    if (candError) {
      console.error('[MEDIA_PROCESS] Erro ao verificar resposta legada:', sanitizeError(candError));
      return 'ambiguous';
    }
    return (candidates && candidates.length > 0) ? 'ambiguous' : 'none';
  } catch (err) {
    console.error('[MEDIA_PROCESS] Exceção na verificação de resposta:', sanitizeError(err));
    return 'ambiguous'; // em dúvida, não reenviar
  }
}

// Responde o cliente automaticamente com base na transcrição do áudio/vídeo
async function replyToClient(message, transcript, summary) {
  if (!supabase) return;

  try {
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', message.conversation_id)
      .single();

    if (convError || !conversation) {
      console.warn('[MEDIA_PROCESS] Conversa não encontrada para resposta automática');
      return;
    }

    const wasHuman = conversation.mode === 'human';
    if (wasHuman) {
      console.log('[MEDIA_PROCESS] Conversa em modo humano, mas resposta do áudio será entregue antes de retornar');
    }

    const clientPhone = conversation.client_phone;
    if (!clientPhone) {
      console.warn('[MEDIA_PROCESS] Telefone do cliente não encontrado');
      return;
    }

    // Busca histórico recente para contexto (máximo 4h)
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { data: messages } = await supabase
      .from('messages')
      .select('text, sender_type, created_at')
      .eq('conversation_id', conversation.id)
      .gte('created_at', fourHoursAgo)
      .order('created_at', { ascending: true });

    const conversationHistory = messages?.slice(-50).map(m => {
      const role = m.sender_type === 'client' ? 'Cliente' : 'Jhon';
      const time = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `[${time}] ${role}: ${m.text}`;
    }).join('\n') || '';

    const prompt = `O cliente enviou um áudio com a seguinte transcrição:\n\n"${transcript}"\n\n${summary ? `Resumo do áudio: ${summary}\n\n` : ''}Responda de forma breve, objetiva e educada como se estivesse respondendo diretamente ao cliente. NUNCA mencione que é uma transcrição, apenas responda ao conteúdo.`;

    console.log(`[MEDIA_PROCESS] Gerando resposta automática para conversa ${conversation.id}`);
    const aiReply = await askGemini(prompt, conversationHistory, conversation);

    // Salva resposta no banco vinculada à mídia de origem (internal_note meta)
    const insertData = {
      conversation_id: conversation.id,
      text: aiReply,
      sender_type: 'bot',
      direction: 'outbound',
      content_type: 'text',
      internal_note: buildMessageMeta({ sourceMessageId: message.id })
    };

    const { data: savedReply, error: saveError } = await supabase
      .from('messages')
      .insert(insertData)
      .select('id')
      .single();

    if (saveError) {
      console.error('[MEDIA_PROCESS] Erro ao salvar resposta automática:', saveError);
      return;
    }

    // Envia resposta via WhatsApp ANTES de qualquer retorno por modo humano
    console.log('[MEDIA_PROCESS] Enviando resposta automática');
    try {
      const waId = await sendWhatsAppMessage(clientPhone, aiReply);
      if (savedReply?.id) {
        await supabase
          .from('messages')
          .update({ ...(waId ? { wa_message_id: waId } : {}), status: 'sent' })
          .eq('id', savedReply.id);
      }
    } catch (sendError) {
      // Resultado incerto: a Meta pode ter recebido. Não reenviar cegamente.
      console.error('[MEDIA_PROCESS] Envio sem confirmação da Meta:', sanitizeError(sendError));
      if (savedReply?.id) {
        await supabase
          .from('messages')
          .update({ status: 'unconfirmed' })
          .eq('id', savedReply.id);
      }
    }

    // Só depois do envio confirmado: pedido explícito de humano notifica o admin.
    // NÃO marca mode='human' — handoff automático não deve silenciar a conversa
    // sem confirmação de que um humano assumiu.
    if (!wasHuman) {
      const needsHuman = detectNeedsHuman(transcript);
      if (needsHuman) {
        await notifyAdminHandoff({
          clientName: conversation.client_name,
          from: clientPhone,
          textBody: transcript,
          log: console
        });
      }
    }
  } catch (error) {
    console.error('[MEDIA_PROCESS] Erro na resposta automática:', error.message);
  }
}

// Gera um resumo jurídico curto a partir da transcrição
async function generateBriefSummary(transcript) {
  if (!transcript || !process.env.GOOGLE_AI_API_KEY) {
    return null;
  }

  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`;

  try {
    const prompt = `Resuma o conteúdo desta transcrição de um atendimento jurídico em 1 a 2 frases curtas e objetivas. Foque no problema jurídico mencionado.\n\nTranscrição: ${transcript.substring(0, 4000)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('[SUMMARY] Resumo gerado, comprimento:', text?.length || 0);
    return text?.trim() || null;
  } catch (error) {
    console.error('[SUMMARY] Erro ao gerar resumo:', error.message);
    return null;
  }
}
