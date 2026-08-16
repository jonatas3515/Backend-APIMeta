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

  const { review_status, review_notes } = req.body;
  const valid = ['revisada','ignorada','convertida_em_nota','convertida_em_agenda'];
  if (!valid.includes(review_status)) {
    return res.status(400).json({ error: 'Status de revisão inválido' });
  }

  try {
    const { data, error } = await supabase
      .from('process_movements')
      .update({
        review_status,
        review_notes: review_notes || null,
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Movimentação não encontrada' });

    await audit('REVIEW', id, req.user, { review_status });
    return res.status(200).json(data);
  } catch (error) {
    console.error('[PROCESS-MOVEMENTS/REVIEW] Erro:', error);
    return res.status(500).json({ error: 'Erro ao revisar movimentação' });
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
    console.error('[PROCESS-MOVEMENTS/REVIEW] Falha ao auditar:', e);
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
