import { createClient } from '@supabase/supabase-js';
import { withAuth, requireRole } from '@/lib/auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

async function handler(req, res) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  try {
    const { method } = req;
    const { id, service_id } = req.query;

    if (method === 'GET') {
      let query = supabaseAdmin.from('fee_adjustment_rules').select('*');
      if (id) query = query.eq('id', id).single();
      if (service_id) query = query.eq('service_id', service_id);

      const { data, error } = await query.order('rule_type', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (method === 'POST') {
      requireRole(req.user, ['admin']);
      const { data, error } = await supabaseAdmin
        .from('fee_adjustment_rules')
        .insert(req.body)
        .select()
        .single();
      if (error) throw error;

      await logAudit(req.user.id, 'fee_adjustment_rules', data.id, 'create', null, data);
      return res.status(201).json(data);
    }

    if (method === 'PATCH') {
      requireRole(req.user, ['admin']);
      if (!id) return res.status(400).json({ error: 'ID obrigatório' });
      const { data: old } = await supabaseAdmin.from('fee_adjustment_rules').select('*').eq('id', id).single();
      const { data, error } = await supabaseAdmin
        .from('fee_adjustment_rules')
        .update(req.body)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;

      await logAudit(req.user.id, 'fee_adjustment_rules', id, 'update', old, data);
      return res.status(200).json(data);
    }

    if (method === 'DELETE') {
      requireRole(req.user, ['admin']);
      if (!id) return res.status(400).json({ error: 'ID obrigatório' });
      const { data: old } = await supabaseAdmin.from('fee_adjustment_rules').select('*').eq('id', id).single();
      const { error } = await supabaseAdmin.from('fee_adjustment_rules').delete().eq('id', id);
      if (error) throw error;

      await logAudit(req.user.id, 'fee_adjustment_rules', id, 'delete', old, null);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (error) {
    console.error('[FEE-RULES] Erro:', error);
    return res.status(500).json({ error: error.message || 'Erro interno' });
  }
}

async function logAudit(userId, entityType, entityId, action, oldValue, newValue) {
  await supabaseAdmin.from('audit_logs').insert({
    user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    old_value: oldValue ? JSON.stringify(oldValue) : null,
    new_value: newValue ? JSON.stringify(newValue) : null,
    created_at: new Date().toISOString()
  });
}

export default withAuth(handler, { minRole: 'estagiario' });
