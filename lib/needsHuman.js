import { sendWhatsAppMessage } from './whatsapp.js';

const ADMIN_WHATSAPP_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER || '';

export const EXPRESS_HUMAN_KEYWORDS = [
  'falar com advogado',
  'falar com alguém',
  'falar com humano',
  'atendimento humano',
  'quero um advogado',
  'preciso de um advogado',
  'quero falar com',
  'preciso falar com',
  'quero atendimento',
  'preciso de atendimento',
  'atende ai',
  'atende aí',
  'chama alguém',
  'me transfere',
  'me passa',
  'passa pra pessoa',
  'passa para a pessoa',
  'passa pro advogado',
  'passa para o advogado',
  'pessoa de verdade',
  'advogado de verdade',
  'atendente',
  'me liga',
  'me ligue',
  'liga pra mim',
  'liga para mim',
  'me chama',
  'me chame',
  'meu atendente',
  'humano',
  'humana'
];

export function detectNeedsHuman(clientMessage, aiResponse, intakeCompleted = false) {
  const clientLower = String(clientMessage || '').toLowerCase();
  const aiLower = String(aiResponse || '').toLowerCase();

  const expressRequest = EXPRESS_HUMAN_KEYWORDS;
  const hasExpressRequest = expressRequest.some(keyword => clientLower.includes(keyword));

  const contextKeywords = intakeCompleted ? [
    'prazo processual',
    'audiência',
    'contratar',
    'honorários',
    'quanto custa',
    'recurso',
    'prazo',
    'demissão',
    'licitação',
    'dispensado',
    'justa causa',
    'indenização',
    'processo',
    'ajuizar',
    'entrar com ação',
    'processo',
    'entrada',
    'colocar no pau',
    'andar',
    'andamento',
    'urgente'
  ] : [];

  const aiMentionsForwarding = !clientLower.includes('[áudio enviado]') &&
    (aiLower.includes('encaminhar') ||
      aiLower.includes('equipe') ||
      aiLower.includes('aguarde o retorno'));

  const hasContextKeyword = contextKeywords.some(keyword => clientLower.includes(keyword));

  return hasExpressRequest || hasContextKeyword || (intakeCompleted && aiMentionsForwarding);
}

export async function notifyAdminHandoff({ clientName, from, textBody, log, adminNumber }) {
  try {
    const admin = adminNumber || ADMIN_WHATSAPP_NUMBER;
    if (!admin) {
      if (log && log.warn) log.warn('admin_notif_unconfigured');
      return false;
    }
    const notificationMessage = `🔔 *Atendimento Humano Solicitado*\n\nCliente: ${clientName}\nTelefone: ${from}\nÚltima mensagem: "${textBody}"\n\nAcesse: https://backend-apimeta.vercel.app/`;
    await sendWhatsAppMessage(admin, notificationMessage);
    if (log) log('admin_notified');
    return true;
  } catch (notifError) {
    if (log && log.error) log.error('admin_notify_failed', { error: notifError.message });
    return false;
  }
}
