import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { safeError } from '@/lib/safeLogger';
import { resolveCaseIdForProcess, verifyCaseAccess } from '@/lib/caseAuth';

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
    const caseId = await resolveCaseIdForProcess({ supabase, processId: id });
    if (!caseId) {
      return res.status(404).json({ error: 'Processo não encontrado' });
    }

    const { allowed } = await verifyCaseAccess({ supabase, caseId, user: req.user });
    if (!allowed) {
      return res.status(403).json({ error: 'Acesso não autorizado ao caso.' });
    }

    const { data, error, count } = await supabase
      .from('process_movements')
      .select('id, case_process_id, external_movement_id, movement_date, movement_text, source, detected_at, review_status, reviewed_by, reviewed_at, review_notes, triage_status, legal_classification, priority, assigned_user_id, triage_notes, suggested_classification, suggested_priority')
      .eq('case_process_id', id)
      .order('movement_date', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;
    return res.status(200).json({ data: data || [], count });
  } catch (error) {
    safeError('datajud_movements_handler_error', error, {
      route: '/api/case-processes/[id]/movements',
      role: req.user?.role,
      processIdHash: String(id).slice(0, 8),
    });
    return res.status(500).json({ error: 'Erro ao listar movimentações' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
