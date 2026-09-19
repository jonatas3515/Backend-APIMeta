import { getClientTitle } from './genderFromName.js';
import { safeLog, safeError } from './safeLogger.js';
import { correctCommonMistakes } from './bot-responses.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function getFirstName(clientName) {
  if (!clientName) return null;
  const first = String(clientName).trim().split(/\s+/)[0];
  if (!first) return null;
  return first;
}

const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GEMINI_API_URL_PRIMARY = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_API_URL_FALLBACK = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;



export async function askGemini(prompt, conversationHistory = '', conversation = null) {
  try {
    safeLog('info', 'gemini_request_start', {
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      hasApiKey: !!GEMINI_API_KEY
    });

    let contextParts = [];

    if (conversation) {
      if (conversation.case_summary) {
        contextParts.push(`RESUMO DO CASO: ${conversation.case_summary}`);
      }
      if (conversation.intake_data?.answers) {
        const answers = Object.entries(conversation.intake_data.answers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
        contextParts.push(`INFORMAÇÕES COLETADAS: ${answers}`);
      }
      const laborCalc = conversation._laborCalculation || conversation.intake_data?.laborCalculation;
      if (laborCalc && laborCalc.totalEstimated != null && Array.isArray(laborCalc.items)) {
        const itemsSummary = laborCalc.items
          .filter(i => i.status === 'calculated' && i.amount > 0)
          .map(i => `${i.name}: R$ ${i.amount.toFixed(2)}`)
          .join('; ');
        contextParts.push(`ESTIMATIVA TRABALHISTA JÁ CALCULADA: ${itemsSummary}. Total: R$ ${laborCalc.totalEstimated.toFixed(2)}. Use esses valores exatos na resposta, sem recalcular. Valores monetários citados no histórico da conversa NÃO são cálculo válido e devem ser ignorados.`);
        safeLog('info', 'labor_estimate_context_injected', { itemsCount: laborCalc.items.length });
      }
    }

    const contextBlock = contextParts.length > 0
      ? `CONTEXTO ATUAL DO ATENDIMENTO:\n${contextParts.join('\n')}\n\n`
      : '';

    const historyBlock = conversationHistory
      ? `HISTÓRICO DAS ÚLTIMAS 4H (MAIS RECENTES POR ÚLTIMO):\n${conversationHistory}\n\n`
      : '';

    const firstTurn = !conversationHistory || conversationHistory.trim() === '';
    const noRepeatRule = firstTurn
      ? 'Se a primeira mensagem for uma saudação, responda com o CUMPRIMENTO informado acima e depois à pergunta. Se a mensagem já apresentar um caso ou pergunta, responda com o CUMPRIMENTO e depois diretamente, sem "Olá".'
      : 'O histórico já existe. NÃO se apresente, NÃO diga "Olá", "Oi" ou cumprimente novamente. Responda DIRETAMENTE ao assunto.';

    const greeting = getGreeting();
    const saudacaoBlock = firstTurn ? `CUMPRIMENTO: ${greeting}\n\n` : '';

    const fullPrompt = `${saudacaoBlock}${contextBlock}${historyBlock}NOVA MENSAGEM DO CLIENTE: ${prompt}\n\nDIRETRIZES PARA ESTA RESPOSTA:\n- ${noRepeatRule}\n- Se a mensagem mencionar CNPJ, boleto, "Neves Costa" (sem &), "outro escritório" ou cobrança/boleto atribuídos a nós e o esclarecimento ainda NÃO tiver sido dito no histórico, então o esclarecimento é a prioridade máxima, sem passar nosso telefone. Palavras como "financiamento", "consórcio", "banco" ou "dívida" sozinhas são tipos de caso e NÃO devem gerar esclarecimento. Depois de esclarecer, NÃO ofereça outros serviços e NÃO liste áreas de atuação.
- Se o esclarecimento sobre boleto/cobrança/Neves Costa JÁ tiver sido dito no histórico e o cliente continuar mencionando o boleto/nome no documento, NÃO repita o esclarecimento inicial. Reconheça a preocupação, peça para conferir a grafia exata e o CNPJ no documento, e oriente a não fazer o pagamento antes de confirmar a origem. Não ofereça telefone.\n- Não peça nome, e-mail ou telefone que já estiverem no histórico ou no contexto.\n- Responda como Jhon, 1-3 frases, sem listas, sem telefone a menos que o cliente peça explicitamente.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      safeLog('warn', 'gemini_timeout', {
        provider: 'gemini',
        timeoutMs: 12000
      });
      controller.abort();
    }, 12000);

    safeLog('info', 'gemini_fetch_start', {
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite'
    });
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
    safeLog('info', 'gemini_fetch_status', {
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      status: response.status
    });

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      safeLog('info', 'gemini_response_success', {
        provider: 'gemini',
        model: 'gemini-2.5-flash-lite',
        responseLength: text?.length || 0
      });
      return correctCommonMistakes(prompt, text) || 'Desculpe, não consegui gerar uma resposta.';
    }

    safeLog('warn', 'gemini_fallback', {
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      status: response.status,
      fallbackModel: 'gemini-3.1-flash-lite'
    });
  } catch (error) {
    safeError('gemini_primary_failed', error, {
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite'
    });
  }

  try {
    safeLog('info', 'gemini_fallback_start', {
      provider: 'gemini',
      model: 'gemini-3.1-flash-lite'
    });
    const fallbackGreeting = firstTurn ? getGreeting() : null;
    const fallbackPrefix = firstTurn
      ? `CUMPRIMENTO: ${fallbackGreeting}\n\n`
      : '';
    const fullPrompt = conversationHistory
      ? `${fallbackPrefix}HISTÓRICO DA CONVERSA:\n${conversationHistory}\n\nNOVA MENSAGEM DO CLIENTE: ${prompt}`
      : `${fallbackPrefix}${prompt}`;

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
      safeError('gemini_fallback_api_error', new Error(`Gemini 3.1 API error: ${response.status} ${response.statusText}`), {
        provider: 'gemini',
        model: 'gemini-3.1-flash-lite',
        status: response.status,
        statusText: response.statusText
      });
      // console.error('[GEMINI] Corpo omitido');
      throw new Error(`Erro na API Gemini: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    safeLog('info', 'gemini_fallback_success', {
      provider: 'gemini',
      model: 'gemini-3.1-flash-lite',
      responseLength: text?.length || 0
    });
    return correctCommonMistakes(prompt, text) || 'Desculpe, não consegui gerar uma resposta.';
  } catch (error) {
    safeError('gemini_both_failed', error, {
      provider: 'gemini'
    });
    throw error;
  }
}
