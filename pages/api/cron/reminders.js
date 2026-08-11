import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'your_whatsapp_phone_number_id_here';
const CRON_SECRET = process.env.CRON_SECRET;

const WHATSAPP_API_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export default async function handler(req, res) {
  // Verificação básica de segurança
  const authHeader = req.headers.authorization;
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  try {
    // Buscar lembretes pendentes com data menor ou igual a agora
    const now = new Date().toISOString();
    const { data: reminders, error } = await supabase
      .from('chat_reminders')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now);

    if (error) throw error;

    let sent = 0;
    let failed = 0;

    for (const reminder of reminders || []) {
      try {
        await sendWhatsAppMessage(reminder.client_phone, reminder.message);

        await supabase
          .from('chat_reminders')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', reminder.id);

        sent++;
      } catch (err) {
        console.error(`[CRON] Erro ao enviar lembrete ${reminder.id}:`, err);
        
        await supabase
          .from('chat_reminders')
          .update({
            status: 'failed',
            error: err.message
          })
          .eq('id', reminder.id);

        failed++;
      }
    }

    console.log(`[CRON] Lembretes processados: ${sent} enviados, ${failed} falhos`);

    return res.status(200).json({
      success: true,
      processed: (reminders || []).length,
      sent,
      failed
    });
  } catch (error) {
    console.error('[CRON] Erro geral:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function sendWhatsAppMessage(to, text) {
  if (!WHATSAPP_TOKEN) {
    throw new Error('Token do WhatsApp não configurado');
  }

  const response = await fetch(WHATSAPP_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData?.error?.message || 'Erro ao enviar mensagem');
  }
}
