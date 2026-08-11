// Detecção de intenção do cliente via WhatsApp

export const INTENT_TYPES = {
  SUMMARY: 'summary',
  STATUS: 'status',
  DOCUMENTS: 'documents',
  NONE: 'none'
};

const SUMMARY_KEYWORDS = [
  'resumo',
  'resumo do meu caso',
  'meu caso',
  'pode resumir',
  'qual é o resumo',
  'me explica o caso',
  'explica meu caso',
  'qual é meu caso'
];

const STATUS_KEYWORDS = [
  'status',
  'como está',
  'andamento',
  'como está meu processo',
  'qual é o status',
  'em que etapa',
  'qual é a situação',
  'como está o caso',
  'progresso',
  'evoluiu'
];

const DOCUMENTS_KEYWORDS = [
  'documentos',
  'faltando documentos',
  'o que falta enviar',
  'quais documentos',
  'documentos faltantes',
  'o que preciso enviar',
  'falta enviar',
  'documentação',
  'quais são os documentos'
];

export function detectIntent(messageText) {
  if (!messageText) return INTENT_TYPES.NONE;

  const text = messageText.toLowerCase().trim();

  // Verifica intenção de resumo
  if (SUMMARY_KEYWORDS.some(keyword => text.includes(keyword))) {
    return INTENT_TYPES.SUMMARY;
  }

  // Verifica intenção de status
  if (STATUS_KEYWORDS.some(keyword => text.includes(keyword))) {
    return INTENT_TYPES.STATUS;
  }

  // Verifica intenção de documentos
  if (DOCUMENTS_KEYWORDS.some(keyword => text.includes(keyword))) {
    return INTENT_TYPES.DOCUMENTS;
  }

  return INTENT_TYPES.NONE;
}

export const DISCLAIMER = `
⚠️ *Aviso importante:* Esta mensagem é um resumo automatizado das informações internas do seu caso. Ela não substitui análise jurídica detalhada nem garante resultado. Em caso de dúvida, peça para falar com um advogado.
`.trim();

export function formatSummaryResponse(caseData) {
  if (!caseData) {
    return `Desculpe, não encontrei informações sobre seu caso. Por favor, fale com um advogado.`;
  }

  const { legal_area, case_type, case_summary, municipality, agency } = caseData;

  return `
*Resumo do seu caso:*

${case_summary || 'Sem resumo disponível'}

*Informações:*
• Área: ${legal_area || 'Não especificada'}
• Tipo: ${case_type || 'Não especificado'}
• Município: ${municipality || 'Não especificado'}
• Órgão: ${agency || 'Não especificado'}

${DISCLAIMER}
`.trim();
}

export function formatStatusResponse(caseData) {
  if (!caseData) {
    return `Desculpe, não encontrei informações sobre o status do seu caso. Por favor, fale com um advogado.`;
  }

  const { status, funnel_stage, deadline_date, deadline_type } = caseData;

  let statusText = '';
  switch (funnel_stage) {
    case 'lead_novo':
      statusText = 'Seu caso está em análise inicial';
      break;
    case 'intake_em_andamento':
      statusText = 'Estamos coletando informações e documentos';
      break;
    case 'intake_concluido':
      statusText = 'Análise inicial concluída, preparando proposta';
      break;
    case 'proposta_enviada':
      statusText = 'Proposta de atendimento foi enviada';
      break;
    case 'contrato_assinado':
      statusText = 'Contrato assinado, iniciando ações';
      break;
    case 'acao_protocolada':
      statusText = 'Ação protocolada, aguardando andamento processual';
      break;
    case 'aguardando_decisao':
      statusText = 'Aguardando decisão do tribunal/órgão';
      break;
    case 'encerrado':
      statusText = 'Caso encerrado';
      break;
    default:
      statusText = `Status: ${status || 'Não especificado'}`;
  }

  let nextStepText = '';
  if (deadline_date) {
    const daysUntil = Math.ceil((new Date(deadline_date) - new Date()) / (1000 * 60 * 60 * 24));
    nextStepText = `\n• Próximo prazo: ${new Date(deadline_date).toLocaleDateString('pt-BR')} (${deadline_type || 'prazo'})`;
    if (daysUntil > 0) {
      nextStepText += ` - Faltam ${daysUntil} dias`;
    }
  }

  return `
*Status do seu caso:*

${statusText}${nextStepText}

*Próximo passo:*
Entraremos em contato em breve com atualizações. Qualquer dúvida, fale conosco!

${DISCLAIMER}
`.trim();
}

export function formatDocumentsResponse(pendingDocuments) {
  if (!pendingDocuments || pendingDocuments.length === 0) {
    return `
*Documentos:*

Todos os documentos necessários foram recebidos! ✅

${DISCLAIMER}
`.trim();
  }

  const docList = pendingDocuments
    .map((doc, idx) => `${idx + 1}. ${doc.name || 'Documento'} - ${doc.description || 'Necessário para análise'}`)
    .join('\n');

  return `
*Documentos que ainda faltam:*

${docList}

Por favor, envie esses documentos para que possamos continuar com a análise do seu caso.

${DISCLAIMER}
`.trim();
}
