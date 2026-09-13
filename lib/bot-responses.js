const THANKS_KEYWORDS = ['obrigado', 'obrigada', 'obg', 'obrig', 'agradecido', 'agradecida', 'valeu', 'agradeço', 'agradecemos'];
const GREETING_KEYWORDS = ['bom dia', 'boa tarde', 'boa noite', 'oi', 'olá', 'ola', 'opa', 'e aí', 'e ai', 'eae', 'tudo bem', 'tudo certo'];
const AGREEMENT_KEYWORDS = ['ok', 'sim', 'entendi', 'certo', 'combinado', 'fechado', 'blz', 'beleza', 'perfeito', 'ótimo', 'otimo', 'show'];

const THANKS_REPLIES = [
  'De nada.',
  'Por nada.',
  'De nada. Ficamos felizes em ajudar.',
  'Por nada. Estamos à disposição.',
  'De nada. Qualquer dúvida, estamos aqui.'
];

const ACKNOWLEDGEMENT_REPLIES = [
  'Entendido.',
  'Perfeito.',
  'Certo.',
  'Entendido. Estamos à disposição.'
];

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function detectThanks(text) {
  if (!text) return false;
  const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return THANKS_KEYWORDS.some(k => lower.includes(k));
}

export function detectGreeting(text) {
  if (!text) return false;
  const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return GREETING_KEYWORDS.some(g => lower.includes(g));
}

export function detectAgreement(text) {
  if (!text) return false;
  const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return AGREEMENT_KEYWORDS.some(k => lower.includes(k));
}

export function getThanksReply() {
  const idx = Math.floor(Math.random() * THANKS_REPLIES.length);
  return THANKS_REPLIES[idx];
}

export function getAcknowledgementReply() {
  const idx = Math.floor(Math.random() * ACKNOWLEDGEMENT_REPLIES.length);
  return ACKNOWLEDGEMENT_REPLIES[idx];
}

export function getToneInstructions() {
  return `LINGUAGEM E TOM (obrigatório):
- Responda em português correto, de forma natural, cordial e respeitosa.
- Ao receber "Obrigado" ou "Obrigada", use "De nada.", "Por nada.", "Ficamos felizes em ajudar." ou "Estamos à disposição." NUNCA responda apenas "Entendi" a um agradecimento.
- O tom pode ser alegre e acolhedor, mas SEMPRE profissional.
- Não use o nome do cliente para iniciar frases; use pronomes como "você", "o senhor" ou "a senhora" quando necessário.
- Seja objetivo: 1-3 frases curtas, sem listas, sem repetir cumprimentos.
- Evite "Entendi" como resposta isolada a confirmações cordiais; prefira "Perfeito.", "Certo." ou "Entendido." quando apropriado.`;
}

export function correctCommonMistakes(userInput, botOutput) {
  if (!userInput || !botOutput) return botOutput;
  if (detectThanks(userInput) && /entendi/i.test(botOutput) && botOutput.length < 80) {
    return getThanksReply();
  }
  return botOutput;
}
