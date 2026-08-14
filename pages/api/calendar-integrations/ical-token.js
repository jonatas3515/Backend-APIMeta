import { withAuth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

function buildIcalUrl(req, token) {
  const host = req.headers.host || 'backend-apimeta.vercel.app';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}/api/calendar-sync/ical?token=${token}`;
}

async function handler(req, res) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  if (req.method === 'GET') {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('ical_token')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(500).json({ error: error?.message || 'Usuário não encontrado' });
    }

    if (!user.ical_token) {
      return res.status(200).json({ icalUrl: null, message: 'Token iCal ainda não gerado' });
    }

    return res.status(200).json({ icalUrl: buildIcalUrl(req, user.ical_token) });
  }

  if (req.method === 'POST') {
    const newToken = randomUUID();

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .update({
        ical_token: newToken,
        ical_token_updated_at: new Date().toISOString()
      })
      .eq('id', req.user.id)
      .select('ical_token')
      .single();

    if (error || !user) {
      console.error('[CALENDAR] Erro ao gerar token iCal:', error);
      return res.status(500).json({ error: error?.message || 'Erro ao gerar token' });
    }

    return res.status(200).json({
      icalUrl: buildIcalUrl(req, user.ical_token),
      token: user.ical_token
    });
  }

  res.status(405).json({ error: 'Método não permitido' });
}

export default withAuth(handler, { minRole: 'estagiario' });
