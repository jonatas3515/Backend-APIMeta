import { safeLog, safeError } from './safeLogger.js';

const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GEMINI_API_URL_PRIMARY = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_API_URL_FALLBACK = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

const RAG_SYSTEM_PROMPT = `Você é um assistente jurídico interno do escritório Neves & Costa Advocacia e Consultoria.

Você deve usar SOMENTE os trechos da base de conhecimento fornecidos abaixo para responder ou elaborar rascunhos. NÃO use conhecimento externo, NÃO invente jurisprudência, números de processo, fatos ou cláusulas que não estejam nos trechos.

REGRAS:
1. Sua resposta deve ser clara, estruturada e no tom formal do escritório.
2. Cite, quando possível, o tipo de documento e a área de origem do trecho usado (ex: "Modelo de petição - Área Consumerista").
3. Se os trechos não forem suficientes para responder com segurança, diga explicitamente: "A base de conhecimento não contém informações suficientes para essa solicitação." e sugira como o advogado pode prosseguir.
4. Se a pergunta pedir um rascunho de peça, elabore o rascunho usando a estrutura dos modelos fornecidos, mantendo os placeholders e sem preencher com dados inventados.
5. Não prometa resultado jurídico. As respostas são auxiliares e devem ser revisadas pelo advogado responsável.
6. Respeite o sigilo profissional e não reproduza dados sensíveis.`;

async function callGemini(prompt, systemPrompt, url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: prompt }] }]
    }),
    signal: controller.signal
  });

  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

export async function askRag(query, context = '') {
  const contextBlock = context
    ? `TRECHOS DA BASE DE CONHECIMENTO DO ESCRITÓRIO:\n${context}\n\n`
    : 'Nenhum trecho relevante foi encontrado na base de conhecimento.\n\n';

  const fullPrompt = `${contextBlock}SOLICITAÇÃO DO USUÁRIO: ${query}\n\nDIRETRIZES: Responda com base nos trechos acima. Seja objetivo, formal e evite inventar. Se não houver base suficiente, informe isso de forma clara.`;

  try {
    safeLog('info', 'rag_gemini_primary_start', {
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      contextLength: context?.length || 0
    });
    const text = await callGemini(fullPrompt, RAG_SYSTEM_PROMPT, GEMINI_API_URL_PRIMARY);
    return text || 'Não foi possível gerar a resposta.';
  } catch (error) {
    safeError('rag_gemini_primary_failed', error, {
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite'
    });
    try {
      safeLog('info', 'rag_gemini_fallback_start', {
        provider: 'gemini',
        model: 'gemini-3.1-flash-lite'
      });
      const text = await callGemini(fullPrompt, RAG_SYSTEM_PROMPT, GEMINI_API_URL_FALLBACK);
      return text || 'Não foi possível gerar a resposta.';
    } catch (fallbackError) {
      safeError('rag_gemini_both_failed', fallbackError, {
        provider: 'gemini'
      });
      throw new Error('Erro ao gerar resposta com a IA.');
    }
  }
}
