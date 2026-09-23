const THANKS_KEYWORDS = ['obrigado', 'obrigada', 'obg', 'obrig', 'agradecido', 'agradecida', 'valeu', 'agradeço', 'agradecemos'];
const GREETING_KEYWORDS = ['bom dia', 'boa tarde', 'boa noite', 'oi', 'olá', 'ola', 'opa', 'e aí', 'e ai', 'eae', 'tudo bem', 'tudo certo'];

const THANKS_REPLIES = [
  'De nada.',
  'Por nada.',
  'De nada. Ficamos felizes em ajudar.',
  'Por nada. Estamos à disposição.'
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

export function getThanksReply() {
  const idx = Math.floor(Math.random() * THANKS_REPLIES.length);
  return THANKS_REPLIES[idx];
}

export function correctCommonMistakes(userInput, botOutput) {
  if (!userInput || !botOutput) return botOutput;
  if (detectThanks(userInput) && /entendi/i.test(botOutput) && botOutput.length < 80) {
    return getThanksReply();
  }
  return botOutput;
}
