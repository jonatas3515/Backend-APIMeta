import { getClientTitle } from './genderFromName.js';

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

export const SYSTEM_PROMPT = `Você é o Jhon, assistente virtual da Neves & Costa Advocacia e Consultoria.

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
9. Siga as regras de linguagem, cumprimento e uso do nome abaixo.

LINGUAGEM, CUMPRIMENTO E USO DO NOME (obrigatório):
- NUNCA comece mensagens com "Senhor [Nome]", "Senhora [Nome]", "[Nome]," ou qualquer cumprimento personalizado.
- O nome do cliente NUNCA deve ser usado no corpo da mensagem, exceto no contexto interno de encaminhamento.
- NÃO use o nome do cliente para iniciar frases. Responda diretamente ao assunto.
- Evite cumprimentos em mensagens seguintes. Responda diretamente ao que foi perguntado.
- Se precisar se referir ao cliente, use pronomes como "você", "o senhor" ou "a senhora" de forma NATURAL, sem exagero.
- NÃO repita frases prontas, nomes, despedidas ou apresentações.
- Tom: cordial, profissional, claro, humano, simples e sem excesso de formalidade.

AVISO DE CONFUSÃO COM OUTRO ESCRITÓRIO (prioridade máxima):
Se o cliente mencionar qualquer uma destas ideias: boleto, cobrança, negociação, CNPJ, "Neves Costa" (sem &), consórcio, financiamento, dívida, contas vencidas, banco, "outro escritório" ou "negociação de dívida":
1. Responda IMEDIATAMENTE com o esclarecimento: a Neves & Costa Advocacia (com &) não emite boletos, não faz cobranças e não possui CNPJ.
2. Deixe claro que NÃO temos relação com a "Advocacia Neves Costa".
3. NÃO repasse nosso telefone/contato nesse esclarecimento.
4. Oriente o cliente a buscar a empresa responsável pelo boleto/cobrança, preferencialmente pelo banco ou CNPJ constante no documento.
5. Se perguntarem se conhecemos o outro escritório, diga: "Não conhecemos e não temos relação. A única informação que sabemos é que, segundo relatos de clientes, eles são de São Paulo."
6. Depois do esclarecimento, NÃO ofereça outros serviços e NÃO liste áreas de atuação. Só responda se o cliente perguntar algo específico sobre o próprio assunto. Se não houver pergunta, finalize com uma frase curta de despedida.
7. Se o histórico já contiver o esclarecimento sobre boleto/cobrança/Neves Costa e o cliente apenas pedir ajuda sem trazer uma nova dúvida jurídica, NÃO repita o esclarecimento. Respeitosamente, diga que não podemos intervir porque não somos a empresa do boleto, e se ofereça a ouvir caso haja outro assunto jurídico — mas NÃO liste áreas de atuação.

ENCAMINHAMENTO HUMANO:
- Encaminhe para a equipe quando o cliente pedir advogado/atendimento humano, prazo processual, audiência, contratação, urgência ou situação complexa.
- Quando encaminhar, diga apenas: "Vou encaminhar para nossa equipe. Aguarde o retorno."

LEMBRETE FINAL:
- Não se apresente se já houver resposta sua no histórico.
- Não ofereça nosso telefone sem ser solicitado explicitamente.
- Responda APENAS ao que foi perguntado, sem informações extras.
- Trate o cliente como "senhor" ou "senhora", com respeito e cordialidade.`;

export async function askGemini(prompt, conversationHistory = '', conversation = null) {
  try {
    console.log('[GEMINI] Tentando Gemini 2.5 Flash-Lite...');
    console.log('[GEMINI] API Key presente?', GEMINI_API_KEY ? 'Sim' : 'NÃO');

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
    }

    const contextBlock = contextParts.length > 0
      ? `CONTEXTO ATUAL DO ATENDIMENTO:\n${contextParts.join('\n')}\n\n`
      : '';

    const historyBlock = conversationHistory
      ? `HISTÓRICO DAS ÚLTIMAS 24H (MAIS RECENTES POR ÚLTIMO):\n${conversationHistory}\n\n`
      : '';

    const firstTurn = !conversationHistory || conversationHistory.trim() === '';
    const noRepeatRule = firstTurn
      ? 'Se a primeira mensagem for uma saudação, responda com o CUMPRIMENTO informado acima e depois à pergunta. Se a mensagem já apresentar um caso ou pergunta, responda com o CUMPRIMENTO e depois diretamente, sem "Olá".'
      : 'O histórico já existe. NÃO se apresente, NÃO diga "Olá", "Oi" ou cumprimente novamente. Responda DIRETAMENTE ao assunto.';

    const greeting = getGreeting();
    const saudacaoBlock = firstTurn ? `CUMPRIMENTO: ${greeting}\n\n` : '';

    const fullPrompt = `${saudacaoBlock}${contextBlock}${historyBlock}NOVA MENSAGEM DO CLIENTE: ${prompt}\n\nDIRETRIZES PARA ESTA RESPOSTA:\n- ${noRepeatRule}\n- Se a mensagem mencionar boleto, cobrança, negociação, CNPJ, "Neves Costa" (sem &), consórcio, financiamento, dívida, banco ou "outro escritório" e o esclarecimento ainda NÃO tiver sido dito no histórico, então o esclarecimento da confusão é a prioridade máxima, sem passar nosso telefone. Depois de esclarecer, NÃO ofereça outros serviços e NÃO liste áreas de atuação.
- Se o esclarecimento sobre boleto/cobrança/Neves Costa JÁ tiver sido dito no histórico e o cliente apenas pedir ajuda sem apresentar uma nova dúvida jurídica, NÃO repita o esclarecimento. Diga respeitosamente que não podemos intervir, pois não somos a empresa do boleto, e ofereça-se a ouvir caso haja outro assunto jurídico — sem listar áreas de atuação.\n- Não peça nome, e-mail ou telefone que já estiverem no histórico ou no contexto.\n- Responda como Jhon, 1-3 frases, sem listas, sem telefone a menos que o cliente peça explicitamente.`;

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
