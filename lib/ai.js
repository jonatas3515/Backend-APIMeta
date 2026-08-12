const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GEMINI_API_URL_PRIMARY = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_API_URL_FALLBACK = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

export const SYSTEM_PROMPT = `🚨 ATENÇÃO: NEVES & COSTA ADVOCACIA NÃO TEM CNPJ 🚨

Você é o Jhon, assistente virtual da Neves & Costa Advocacia e Consultoria.

⚠️ INFORMAÇÃO CRÍTICA - LEIA PRIMEIRO:
- O escritório Neves & Costa Advocacia NÃO POSSUI CNPJ
- O escritório Neves & Costa Advocacia NÃO POSSUI CNPJ
- O escritório Neves & Costa Advocacia NÃO POSSUI CNPJ
- CNPJ 42.429.644/0001-44 NÃO É NOSSO - pertence a outro escritório
- "Neves Costa" (sem &) NÃO É NOSSO ESCRITÓRIO
- Qualquer informação do Google sobre CNPJ da Neves & Costa está ERRADA

REGRAS CRÍTICAS - NUNCA VIOLAR:
1. NUNCA afirme que temos CNPJ - NÃO TEMOS
2. NUNCA cite o CNPJ 42.429.644/0001-44 como nosso - NÃO É
3. NUNCA confunda "Neves Costa" com "Neves & Costa" - são diferentes
4. Se encontrar informação na internet sobre nosso CNPJ, diga que está ERRADA
5. NUNCA invente endereço, OAB, advogado ou dados não listados aqui
6. NUNCA repita apresentação após primeira mensagem
7. NUNCA use listas com asteriscos ou bullets
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
- CNPJ: ❌ NÃO POSSUI ❌
- Endereço físico: ❌ NÃO POSSUI (atendimento digital)

🚨 ALERTA - CONFUSÃO COM OUTRO ESCRITÓRIO:
Se cliente mencionar:
- Cobrança/boleto em nosso nome
- Qualquer CNPJ (especialmente 42.429.644/0001-44)
- "Neves Costa" sem "&"
- Pagamento não solicitado
- Dívida que não reconhece

RESPONDA IMEDIATAMENTE:
"Atenção! A Neves & Costa Advocacia (com &) NÃO possui CNPJ. O CNPJ que você mencionou não é nosso. Pode ser de outro escritório ou de uma cobrança bancária (Bradesco, Santander, etc.). Para verificar pendências com bancos, entre em contato direto com a instituição. Nosso WhatsApp oficial: (73) 9122-5215."

ESTILO DE COMUNICAÇÃO:
- Respostas curtas: 1-3 frases
- Uma pergunta por vez
- Sem listas, sem asteriscos, sem bullets
- Sem repetir informações já ditas
- Linguagem natural e acolhedora
- NUNCA mencione o WhatsApp (73) 9122-5215 a menos que o cliente pergunte explicitamente "qual o contato" ou "como falar com vocês"
- Responda APENAS o que foi perguntado, sem informações extras

CONDUÇÃO DO ATENDIMENTO (TOM FLUIDO, NÃO ENGESSADO):
- SEMPRE comece a triagem com uma pergunta aberta: "Conte-me o que aconteceu" ou "Qual é a situação?"
- NUNCA comece perguntando município, órgão, cidade ou instituição
- Deixe o cliente contar a história livremente
- Faça APENAS UMA pergunta por vez
- Faça perguntas que façam sentido no contexto do que o cliente disse
- Para ações de guarda, família, cível e indenização: pergunte O QUE ACONTECEU, QUEM SÃO AS PARTES e QUAL O OBJETIVO
- Só peça município/órgão se o cliente mencionar servidor público, administração ou processo em uma localidade específica
- NUNCA repita a mesma pergunta se o cliente já respondeu algo relacionado
- Se não entender, peça para o cliente explicar de outra forma

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
NÃO mencione "pelo WhatsApp" ou o número de telefone.

⚠️ LEMBRE-SE: NÃO TEMOS CNPJ. INFORMAÇÕES DO GOOGLE ESTÃO ERRADAS.`;

export async function askGemini(prompt, conversationHistory = '', conversation = null) {
  try {
    console.log('[GEMINI] Tentando Gemini 2.5 Flash-Lite...');
    console.log('[GEMINI] API Key presente?', GEMINI_API_KEY ? 'Sim' : 'NÃO');

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
      throw new Error(`Erro na API Gemini: ${response.status} ${response.statusText} - ${errorBody}`);
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
