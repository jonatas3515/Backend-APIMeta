import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

/**
 * GET /api/cases/active?conversation_id=<id>
 * Retorna o caso ativo vinculado a uma conversa (se existir)
 * Caso ativo = status != 'encerrado'
 */
async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { conversation_id } = req.query;

  if (!conversation_id) {
    return res.status(400).json({ error: 'conversation_id é obrigatório' });
  }

  try {
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .eq('conversation_id', conversation_id)
      .neq('status', 'encerrado')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    // Retorna null se não houver caso ativo
    return res.status(200).json(data);
  } catch (error) {
    console.error('[CASES_ACTIVE] Erro ao buscar caso ativo:', error);
    return res.status(500).json({ error: 'Erro ao buscar caso ativo' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
