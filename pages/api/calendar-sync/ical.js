import { createClient } from '@supabase/supabase-js';
import { getIcalEvents, generateIcal } from '@/lib/calendar';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const { token } = req.query;
  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, email, name')
    .eq('ical_token', token)
    .single();

  if (userError || !user) {
    return res.status(401).json({ error: 'Token inválido ou revogado' });
  }

  const today = new Date();
  const startDate = today.toISOString().split('T')[0];
  const endDate = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    const events = await getIcalEvents(startDate, endDate);
    const ics = generateIcal(events);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="agenda-neves-costa.ics"');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(ics);
  } catch (error) {
    console.error('[ICAL] Erro ao gerar feed:', error);
    res.status(500).json({ error: 'Erro ao gerar feed iCal' });
  }
}
