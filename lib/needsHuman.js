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
  'meu atendente',
  'humano',
  'humana'
];

// Handoff automático só por pedido explícito de atendimento humano.
// Assunto complexo, área jurídica ou menção da IA a "encaminhar/equipe"
// NÃO disparam handoff — isso compete com a conversa normal do Gemini.
export function detectNeedsHuman(clientMessage) {
  const clientLower = String(clientMessage || '').toLowerCase();
  return EXPRESS_HUMAN_KEYWORDS.some(keyword => clientLower.includes(keyword));
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
