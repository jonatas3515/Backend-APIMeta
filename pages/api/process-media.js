import { createClient } from '@supabase/supabase-js';
import { transcribeAudio, summarizeMedia } from '../../lib/mediaProcessing';
import { askGemini } from '../../lib/ai';
import { sendWhatsAppMessage } from '../../lib/whatsapp';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_SECRET = process.env.MEDIA_PROCESS_SECRET;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

// Número máximo de mensagens por execução para evitar timeout na Vercel
const BATCH_SIZE = 5;

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
    // Busca mídias pendentes (áudio e vídeo primeiro; imagem/documento como secundário)
    const { data: pendingMessages, error: fetchError } = await supabase
      .from('messages')
      .select('id, conversation_id, content_type, media_url, text')
      .in('content_type', ['audio', 'video', 'image', 'document'])
      .eq('media_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('[MEDIA_PROCESS] Erro ao buscar mídias pendentes:', fetchError);
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

      const mimeType = getMimeFromUrl(media_url) || `audio/ogg`;
      let transcript = '';
      let summary = '';
      let status = 'processed';

      try {
        if (content_type === 'audio' || content_type === 'video') {
          console.log(`[MEDIA_PROCESS] Transcrevendo mensagem ${id}: ${media_url}`);
          transcript = await transcribeAudio(media_url, mimeType);
          console.log(`[TRANSCRIPTION] Mensagem ${id}: ${transcript?.substring(0, 80)}`);

          if (transcript) {
            summary = await generateBriefSummary(transcript);
          }
        } else if (content_type === 'image' || content_type === 'document') {
          console.log(`[MEDIA_PROCESS] Resumindo mensagem ${id}: ${media_url}`);
          summary = await summarizeMedia(media_url, mimeType);
        }
      } catch (processError) {
        console.error(`[MEDIA_PROCESS] Erro ao processar mensagem ${id}:`, processError.message);
        status = 'failed';
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
        console.error(`[MEDIA_PROCESS] Erro ao salvar mensagem ${id}:`, updateError);
      } else {
        console.log(`[MEDIA_PROCESS] Mensagem ${id} processada: status=${status}`);
        results.push({ id, content_type, status });

        // Se áudio/vídeo foi transcrito com sucesso, responde o cliente
        if ((content_type === 'audio' || content_type === 'video') && transcript && status === 'processed') {
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

    if (conversation.mode === 'human') {
      console.log('[MEDIA_PROCESS] Conversa em modo humano, não respondendo automaticamente');
      return;
    }

    const clientPhone = conversation.client_phone;
    if (!clientPhone) {
      console.warn('[MEDIA_PROCESS] Telefone do cliente não encontrado');
      return;
    }

    // Busca histórico recente para contexto
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: messages } = await supabase
      .from('messages')
      .select('text, sender_type, created_at')
      .eq('conversation_id', conversation.id)
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: true });

    const conversationHistory = messages?.slice(-50).map(m => {
      const role = m.sender_type === 'client' ? 'Cliente' : 'Jhon';
      const time = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `[${time}] ${role}: ${m.text}`;
    }).join('\n') || '';

    const prompt = `O cliente enviou um áudio com a seguinte transcrição:\n\n"${transcript}"\n\n${summary ? `Resumo do áudio: ${summary}\n\n` : ''}Responda de forma breve, objetiva e educada como se estivesse respondendo diretamente ao cliente. NUNCA mencione que é uma transcrição, apenas responda ao conteúdo.`;

    console.log(`[MEDIA_PROCESS] Gerando resposta automática para conversa ${conversation.id}`);
    const aiReply = await askGemini(prompt, conversationHistory, conversation);

    // Salva resposta no banco
    const insertData = {
      conversation_id: conversation.id,
      text: aiReply,
      sender_type: 'bot',
      direction: 'outbound',
      content_type: 'text'
    };

    const { error: saveError } = await supabase
      .from('messages')
      .insert(insertData);

    if (saveError) {
      console.error('[MEDIA_PROCESS] Erro ao salvar resposta automática:', saveError);
    }

    // Envia resposta via WhatsApp
    console.log(`[MEDIA_PROCESS] Enviando resposta automática para ${clientPhone}`);
    await sendWhatsAppMessage(clientPhone, aiReply);
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
    console.log('[SUMMARY] Resumo gerado:', text?.substring(0, 120));
    return text?.trim() || null;
  } catch (error) {
    console.error('[SUMMARY] Erro ao gerar resumo:', error.message);
    return null;
  }
}
