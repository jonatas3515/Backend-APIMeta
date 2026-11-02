import { withAuth, supabaseAdmin, getTenantOfficeId } from '@/lib/auth';
import logger from '@/lib/logger';

async function handler(req, res) {
  const start = Date.now();
  const userId = req.user?.id;
  const officeId = getTenantOfficeId(req);

  if (!supabaseAdmin) {
    logger('error', 'CONVERSATIONS_LIST_ERROR', { userId, httpStatus: 500, errorCode: 'SUPABASE_NOT_CONFIGURED' });
    return res.status(500).json({ error: 'Supabase nao configurado' });
  }

  try {
    if (req.method !== 'GET') {
      logger('warn', 'CONVERSATIONS_LIST_INVALID_METHOD', { userId, httpStatus: 405 });
      return res.status(405).json({ error: 'Metodo nao permitido' });
    }

    logger('info', 'CONVERSATIONS_LIST_START', { userId, officeId });

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('id, client_name, client_phone, client_status, legal_area, updated_at')
      .eq('office_id', officeId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    logger('info', 'CONVERSATIONS_LIST_SUCCESS', { userId, httpStatus: 200, count: (data || []).length, durationMs: Date.now() - start });
    return res.status(200).json(data || []);
  } catch (error) {
    logger('error', 'CONVERSATIONS_LIST_ERROR', { userId, httpStatus: 500, durationMs: Date.now() - start });
    return res.status(500).json({ error: 'Erro ao buscar conversas' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
