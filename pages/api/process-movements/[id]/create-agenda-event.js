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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID da movimentação é obrigatório' });

  const { event_date, event_time, title, description, priority = 'media', location } = req.body;
  if (!event_date || !title) {
    return res.status(400).json({ error: 'event_date e title são obrigatórios' });
  }

  if (!['baixa','media','alta'].includes(priority)) {
    return res.status(400).json({ error: 'Prioridade inválida' });
  }

  try {
    const { data: movement, error: mErr } = await supabase
      .from('process_movements')
      .select('id, case_process_id, case_processes:case_process_id (case_id)')
      .eq('id', id)
      .single();

    if (mErr || !movement) {
      return res.status(404).json({ error: 'Movimentação não encontrada' });
    }

    const caseId = movement.case_processes?.case_id;
    if (!caseId) {
      return res.status(400).json({ error: 'Movimentação não vinculada a um caso' });
    }

    const { data, error } = await supabase
      .from('case_events')
      .insert({
        case_id: caseId,
        event_date,
        event_time: event_time || null,
        event_type: 'outro',
        description: description || title,
        priority,
        location: location || null,
        created_by_user_id: req.user.id
      })
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from('process_movements')
      .update({
        review_status: 'convertida_em_agenda',
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id);

    await audit('CREATE_AGENDA', id, req.user, { event_id: data.id });
    return res.status(201).json(data);
  } catch (error) {
    console.error('[PROCESS-MOVEMENTS/CREATE-AGENDA] Erro:', error);
    return res.status(500).json({ error: 'Erro ao criar evento na agenda' });
  }
}

async function audit(action, targetId, user, details = null) {
  try {
    await supabase.from('audit_logs').insert({
      action,
      table_name: 'process_movements',
      record_id: targetId,
      user_id: user.id,
      user_email: user.email,
      details
    });
  } catch (e) {
    console.error('[PROCESS-MOVEMENTS/CREATE-AGENDA] Falha ao auditar:', e);
  }
}

export default withAuth(handler, { minRole: 'advogado' });
