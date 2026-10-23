import { withAuth, supabaseAdmin } from '@/lib/auth';
import { getDefaultOfficeId } from '@/lib/officeContext';
import logger from '@/lib/logger';

async function handler(req, res) {
  const userId = req.user?.id;

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const officeId = req.query.office_id || req.user?.office_id || getDefaultOfficeId();

  try {
    const { data, error } = await supabaseAdmin
      .from('offices')
      .select('id, name, cnpj, email, phone, logo_url, plan, status, trial_ends_at, created_at')
      .eq('id', officeId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Escritório não encontrado' });
    }

    logger('info', 'OFFICE_CURRENT_SUCCESS', { userId, officeId, httpStatus: 200 });
    return res.status(200).json(data);
  } catch (error) {
    logger('error', 'OFFICE_CURRENT_ERROR', { userId, officeId, httpStatus: 500 });
    return res.status(500).json({ error: 'Erro ao buscar escritório' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
