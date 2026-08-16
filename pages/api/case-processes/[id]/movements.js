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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID do processo é obrigatório' });

  const { limit = '20', offset = '0' } = req.query;

  try {
    const { data, error, count } = await supabase
      .from('process_movements')
      .select('*', { count: 'exact' })
      .eq('case_process_id', id)
      .order('movement_date', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;
    return res.status(200).json({ data: data || [], count });
  } catch (error) {
    console.error('[CASE-PROCESSES/MOVEMENTS] Erro:', error);
    return res.status(500).json({ error: 'Erro ao listar movimentações' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
