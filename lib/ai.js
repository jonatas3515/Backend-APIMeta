import { getClientTitle } from './genderFromName.js';
import { safeLog, safeError } from './safeLogger.js';
import { getToneInstructions, correctCommonMistakes } from './bot-responses.js';

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

ATENDIMENTO TRABALHISTA E RESCISÃO:
- Se o cliente relatar demissão, falta de pagamento ou pedir cálculo de rescisão:
  1. Acolha com empatia em 1-2 frases. Reconheça a situação (especialmente se relatar que não assinaram a carteira ou não pagaram direitos).
  2. NUNCA fique repetindo perguntas burocráticas sobre datas exatas se o cliente já deu uma estimativa (ex.: 'desde janeiro', 'fui demitido hoje').
  3. Se o cliente já informou salário e período aproximado, pontue que ele tem direito a saldo de salário, 13º e férias proporcionais, além da discussão sobre o aviso-prévio e FGTS com multa — sem estimar valores: isso é exclusivo do sistema de cálculo.
  4. Informe que, havendo falta de anotação na carteira (CTPS), essas verbas e o próprio vínculo devem ser regularizados.
  5. Peça para ele enviar os comprovantes ou holerites/extratos que tiver para análise da nossa equipe e avise que um advogado vai avaliar o caso.

REGRA CRÍTICA DE VALORES NUMÉRICOS:
- Você NUNCA deve fazer contas de cabeça e NUNCA deve inventar valores em reais.
- Você SOMENTE pode informar valores em reais se eles constarem expressamente no bloco 'ESTIMATIVA TRABALHISTA JÁ CALCULADA' no seu contexto — nesse caso, repita os números exatos desse bloco.
- Se o cliente perguntar valores ('Quanto dá?', 'E o FGTS?', 'Quanto tenho a receber?') e NÃO houver o bloco 'ESTIMATIVA TRABALHISTA JÁ CALCULADA' no contexto, responda explicando quais são as verbas devidas, mas NÃO invente números. Diga: 'Para fornecer os valores exatos da sua estimativa, preciso apenas confirmar o valor do seu salário e as datas aproximadas de início e término.'
- Sempre que apresentar valores da estimativa calculada, adicione a ressalva: 'Lembrando que esta é uma estimativa preliminar para sua orientação, e a apuração exata de todos os reflexos será feita pela nossa equipe jurídica.'
- Valores monetários que apareçam no histórico da conversa (inclusive em respostas anteriores suas) NÃO são cálculo válido. Ignore-os: a única fonte autorizada de números é o bloco 'ESTIMATIVA TRABALHISTA JÁ CALCULADA'.

RACIOCÍNIO JURÍDICO-PRÁTICO TRABALHISTA:
- Se o tempo total de serviço for inferior a 12 meses, NÃO mencione "férias vencidas" como pendência a confirmar. Elas não existem no plano fático.
- Considere apenas férias e 13º proporcionais para vínculos menores de 1 ano.
- Se o usuário disser que foi dispensado imediatamente ("não precisa voltar mais", "fui mandado embora hoje"), presuma AVISO-PRÉVIO INDENIZADO (30 dias base).
- Aplique a projeção do aviso-prévio indenizado no cálculo dos avos de férias proporcionais e 13º proporcional.
- Em dispensas sem justa causa ou quando a carteira não foi assinada, o sistema de cálculo já inclui os depósitos de FGTS do período (8% sobre a remuneração) e a multa rescisória de 40% — você apenas informa, nunca calcula.
- Seja direto, claro e evite repetir ressalvas redundantes na mesma mensagem.
- NUNCA repita a mesma mensagem de texto duas vezes seguidas quando o cliente insistir — reformule ou aprofunde a resposta.

ENCAMINHAMENTO HUMANO:
- Encaminhe para a equipe quando o cliente pedir advogado/atendimento humano, prazo processual, audiência, contratação, urgência ou situação complexa.
- Quando encaminhar, diga apenas: "Vou encaminhar para nossa equipe. Aguarde o retorno."

LEMBRETE FINAL:
- Não se apresente se já houver resposta sua no histórico.
- Não ofereça nosso telefone sem ser solicitado explicitamente.
- Responda APENAS ao que foi perguntado, sem informações extras.
- Trate o cliente como "senhor" ou "senhora" somente quando tiver certeza do gênero; caso contrário, use "você" ou o primeiro nome.
${getToneInstructions()}`;

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
- Se o esclarecimento sobre boleto/cobrança/Neves Costa JÁ tiver sido dito no histórico e o cliente apenas pedir ajuda sem apresentar uma nova dúvida jurídica, NÃO repita o esclarecimento. Diga respeitosamente que não podemos intervir, pois não somos a empresa do boleto, e ofereça-se a ouvir caso haja outro assunto jurídico — sem listar áreas de atuação.\n- Não peça nome, e-mail ou telefone que já estiverem no histórico ou no contexto.\n- Responda como Jhon, 1-3 frases, sem listas, sem telefone a menos que o cliente peça explicitamente.`;

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
