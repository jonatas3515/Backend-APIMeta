/**
 * Adaptador de integração offline para o fluxo de cálculo de verbas trabalhistas.
 *
 * Regras:
 * - Não duplica lógica do orquestrador, classificador, intake, motor ou formatador.
 * - Não calcula, arredonda nem inventa valores.
 * - Não persiste state nem registra message, salário, datas ou PII.
 * - Não integra ativamente com WhatsApp, Gemini, webhook, banco ou API externa.
 * - Recebe e devolve o estado para que o chamador decida como manter o contexto.
 */

const { handleLaborSettlementMessage } = require('./laborSettlementOrchestrator');

/**
 * Adapta uma mensagem ao fluxo trabalhista.
 *
 * @param {object} params
 * @param {string} params.message - texto da mensagem do usuário.
 * @param {object} [params.state] - estado do fluxo trabalhista.
 * @param {object} [params.metadata] - metadados opcionais de origem (não armazenados).
 * @returns {object} resultado do fluxo trabalhista.
 */
function adaptLaborSettlement({ message = '', state = {}, metadata = {} } = {}) {
  const safeMessage = typeof message === 'string' ? message : String(message || '');
  const safeState = typeof state === 'object' && state !== null ? state : {};

  try {
    const result = handleLaborSettlementMessage({
      message: safeMessage,
      state: safeState
    });

    const handled = result.intent !== 'other';

    return {
      handled,
      flow: result.intent,
      state: result.state,
      response: result.response,
      calculation: result.calculation,
      missingFields: result.missingFields,
      warnings: result.warnings
    };
  } catch (err) {
    return {
      handled: false,
      flow: 'error',
      state: {
        active: false,
        intent: null,
        collected: {},
        askedFields: [],
        status: 'idle'
      },
      response: {
        kind: 'error',
        text: 'Não foi possível processar a solicitação. Tente reformular ou falar com um atendente.',
        data: null
      },
      calculation: null,
      missingFields: [],
      warnings: ['Erro interno no fluxo de cálculo trabalhista.']
    };
  }
}

module.exports = { adaptLaborSettlement };
