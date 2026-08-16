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

  const { note } = req.body;
  if (!note || !note.trim()) {
    return res.status(400).json({ error: 'Texto da nota é obrigatório' });
  }

  try {
    // Busca a movimentação e o caso/conversa associado
    const { data: movement, error: mErr } = await supabase
      .from('process_movements')
      .select('id, case_process_id, case_processes:case_process_id (case_id, cases:case_id (conversation_id))')
      .eq('id', id)
      .single();

    if (mErr || !movement) {
      return res.status(404).json({ error: 'Movimentação não encontrada' });
    }

    const caseId = movement.case_processes?.case_id;
    const conversationId = movement.case_processes?.cases?.conversation_id;

    if (!caseId) {
      return res.status(400).json({ error: 'Movimentação não vinculada a um caso' });
    }

    const { data, error } = await supabase
      .from('internal_notes')
      .insert({
        conversation_id: conversationId || null,
        case_id: caseId,
        user_id: req.user.id,
        text: note.trim(),
        is_visible_to_client: false
      })
      .select()
      .single();

    if (error) throw error;

    // Marca movimentação como convertida
    await supabase
      .from('process_movements')
      .update({
        review_status: 'convertida_em_nota',
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        review_notes: note.trim()
      })
      .eq('id', id);

    await audit('CREATE_NOTE', id, req.user, { note_id: data.id });
    return res.status(201).json({ note: data, movement_id: id });
  } catch (error) {
    console.error('[PROCESS-MOVEMENTS/CREATE-NOTE] Erro:', error);
    return res.status(500).json({ error: 'Erro ao criar nota' });
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
    console.error('[PROCESS-MOVEMENTS/CREATE-NOTE] Falha ao auditar:', e);
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
