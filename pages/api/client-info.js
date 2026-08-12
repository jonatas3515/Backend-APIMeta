import { createClient } from '@supabase/supabase-js';
import { detectIntent, INTENT_TYPES, formatSummaryResponse, formatStatusResponse, formatDocumentsResponse } from '@/lib/client-intent';
import { askGemini } from '@/lib/ai';
import { withAuth } from '@/lib/auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const { method } = req;

  try {
    if (method === 'POST') {
      return handlePost(req, res);
    } else if (method === 'GET') {
      return handleGet(req, res);
    } else {
      return res.status(405).json({ error: 'Método não permitido' });
    }
  } catch (error) {
    console.error('[CLIENT-INFO] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });

async function handlePost(req, res) {
  const { action } = req.body;

  try {
    if (action === 'process_message') {
      const { conversation_id, message_text } = req.body;

      if (!conversation_id || !message_text) {
        return res.status(400).json({ error: 'conversation_id e message_text são obrigatórios' });
      }

      // Detecta intenção
      const intent = detectIntent(message_text);

      if (intent === INTENT_TYPES.NONE) {
        return res.status(200).json({
          intent: INTENT_TYPES.NONE,
          response: null,
          message: 'Nenhuma intenção detectada'
        });
      }

      // Busca caso associado
      const { data: caseData, error: caseError } = await supabase
        .from('cases')
        .select('*')
        .eq('conversation_id', conversation_id)
        .single();

      let response = '';

      if (intent === INTENT_TYPES.SUMMARY) {
        response = formatSummaryResponse(caseData);

        // Aprimora com IA se houver dados
        if (caseData && caseData.case_summary) {
          const aiPrompt = `Você é um assistente jurídico da Neves & Costa. 
Com base no resumo abaixo, explique para o cliente em português simples (máximo 3 frases) o que é o caso, 
qual é o problema principal e que tipo de análise o escritório está fazendo. 
Deixe claro que isso NÃO é parecer jurídico nem garante resultado.

RESUMO: ${caseData.case_summary}
ÁREA: ${caseData.legal_area || 'Geral'}
TIPO: ${caseData.case_type || 'Não especificado'}

Responda APENAS com o texto para o cliente, sem explicações adicionais.`;

          try {
            const aiResponse = await askGemini(aiPrompt, '');
            response = `*Resumo do seu caso:*\n\n${aiResponse}\n\n⚠️ *Aviso:* Esta mensagem é um resumo automatizado. Ela não substitui análise jurídica detalhada nem garante resultado.`;
          } catch (aiError) {
            console.error('[CLIENT-INFO] Erro ao chamar IA para summary:', aiError);
            // Usa resposta formatada como fallback
          }
        }
      } else if (intent === INTENT_TYPES.STATUS) {
        response = formatStatusResponse(caseData);

        // Aprimora com IA se houver dados
        if (caseData) {
          const aiPrompt = `Você é um assistente jurídico da Neves & Costa.
Com base no status abaixo, explique para o cliente em português simples (máximo 2 frases) 
em que etapa está o caso e qual é o próximo passo. Deixe claro que é apenas andamento, sem comentário jurídico.

STATUS: ${caseData.status || 'Não especificado'}
ETAPA: ${caseData.funnel_stage || 'Não especificada'}
PRAZO: ${caseData.deadline_date ? new Date(caseData.deadline_date).toLocaleDateString('pt-BR') : 'Sem prazo definido'}

Responda APENAS com o texto para o cliente, sem explicações adicionais.`;

          try {
            const aiResponse = await askGemini(aiPrompt, '');
            response = `*Status do seu caso:*\n\n${aiResponse}\n\n⚠️ *Aviso:* Esta mensagem é apenas informativa. Qualquer dúvida, fale com um advogado.`;
          } catch (aiError) {
            console.error('[CLIENT-INFO] Erro ao chamar IA para status:', aiError);
          }
        }
      } else if (intent === INTENT_TYPES.DOCUMENTS) {
        // Busca documentos pendentes (simplificado: usa reminders como proxy)
        const { data: reminders } = await supabase
          .from('chat_reminders')
          .select('*')
          .eq('conversation_id', conversation_id)
          .eq('status', 'pending')
          .eq('reminder_type', 'buscar_documento');

        const pendingDocs = reminders?.map(r => ({
          name: r.title,
          description: r.message
        })) || [];

        response = formatDocumentsResponse(pendingDocs);

        // Aprimora com IA
        if (pendingDocs.length > 0) {
          const docList = pendingDocs.map(d => `- ${d.name}: ${d.description}`).join('\n');
          const aiPrompt = `Você é um assistente jurídico da Neves & Costa.
Com base na lista de documentos faltantes abaixo, explique para o cliente em português simples (máximo 3 frases) 
quais documentos ainda precisa enviar e por que são importantes, sem prometer resultado.

DOCUMENTOS FALTANTES:
${docList}

Responda APENAS com o texto para o cliente, sem explicações adicionais.`;

          try {
            const aiResponse = await askGemini(aiPrompt, '');
            response = `*Documentos que ainda faltam:*\n\n${aiResponse}\n\nPor favor, envie esses documentos para que possamos continuar com a análise.\n\n⚠️ *Aviso:* Esta mensagem é apenas informativa.`;
          } catch (aiError) {
            console.error('[CLIENT-INFO] Erro ao chamar IA para documents:', aiError);
          }
        }
      }

      // Registra requisição
      const { error: insertError } = await supabase
        .from('client_info_requests')
        .insert({
          conversation_id,
          case_id: caseData?.id || null,
          intent_type: intent,
          request_text: message_text,
          response_text: response
        });

      if (insertError) {
        console.error('[CLIENT-INFO] Erro ao registrar requisição:', insertError);
      }

      return res.status(200).json({
        intent,
        response,
        case_id: caseData?.id || null
      });
    }
  } catch (error) {
    console.error('[CLIENT-INFO] Erro ao processar:', error);
    return res.status(500).json({ error: 'Erro ao processar requisição' });
  }
}

async function handleGet(req, res) {
  const { conversation_id, limit = 10 } = req.query;

  if (!conversation_id) {
    return res.status(400).json({ error: 'conversation_id é obrigatório' });
  }

  try {
    const { data, error } = await supabase
      .from('client_info_requests')
      .select('*')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    return res.status(200).json(data || []);
  } catch (error) {
    console.error('[CLIENT-INFO] Erro ao buscar requisições:', error);
    return res.status(500).json({ error: 'Erro ao buscar requisições' });
  }
}
