import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { safeError } from '@/lib/safeLogger';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

const JONATAS_PHONE = '5573999348552';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Banco de dados não configurado' });
  }

  const { caseId, target = 'advogado' } = req.body || {};

  if (!caseId) {
    return res.status(400).json({ error: 'ID do caso é obrigatório.' });
  }

  try {
    const { data: caseItem, error: caseErr } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();

    if (caseErr || !caseItem) {
      return res.status(404).json({ error: 'Caso não localizado.' });
    }

    const prazoFormatado = caseItem.deadline_date
      ? new Date(caseItem.deadline_date).toLocaleDateString('pt-BR')
      : 'Sem data fixada';

    let destinationPhone = JONATAS_PHONE;
    let messageText = '';

    if (target === 'advogado') {
      destinationPhone = JONATAS_PHONE;
      messageText = `⚖️ *ALERTA PROCESSUAL — JusJNC Advocacia*

📁 *Caso:* ${caseItem.title}
🔢 *Processo:* ${caseItem.process_number || 'Sem CNJ informado'}
📍 *Comarca / Vara:* ${caseItem.judicial_district || 'Não informada'} • ${caseItem.court_division || 'Juízo não informado'}
🎯 *Fase:* ${caseItem.procedural_step || caseItem.status || 'Em andamento'}
⏰ *Prazo / Audiência:* ${prazoFormatado} (${caseItem.deadline_type || 'Prazo Judicial'})

_Notificação gerada pelo sistema JusJNC para acompanhamento forense._`;
    }

    // Dispara via WhatsApp Cloud API do número do escritório
    await sendWhatsAppMessage(destinationPhone, messageText);

    return res.status(200).json({
      success: true,
      sent_to: destinationPhone,
      message: `Alerta enviado com sucesso para seu WhatsApp (${destinationPhone})!`
    });
  } catch (err) {
    safeError('whatsapp_alert_error', err, { caseId, target });
    return res.status(500).json({
      error: err.message || 'Erro ao enviar alerta por WhatsApp. Verifique se o número do escritório está ativo.'
    });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
