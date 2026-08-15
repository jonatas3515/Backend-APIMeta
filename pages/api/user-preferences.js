import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('users')
        .select('preferred_legal_area')
        .eq('id', userId)
        .single();

      if (error) throw error;

      return res.status(200).json({
        preferred_legal_area: data?.preferred_legal_area || ''
      });
    }

    if (req.method === 'PATCH') {
      const { preferred_legal_area } = req.body;

      const { data, error } = await supabase
        .from('users')
        .update({ preferred_legal_area: preferred_legal_area || null })
        .eq('id', userId)
        .select('preferred_legal_area')
        .single();

      if (error) throw error;

      return res.status(200).json({
        preferred_legal_area: data?.preferred_legal_area || ''
      });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (error) {
    console.error('[USER-PREFERENCES] Erro:', error);
    return res.status(500).json({ error: error.message || 'Erro interno' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
