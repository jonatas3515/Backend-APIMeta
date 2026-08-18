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
    const { id, table_type, active } = req.query;

    if (method === 'GET') {
      let query = supabaseAdmin.from('fee_uploaded_tables').select('*');
      if (id) query = query.eq('id', id).single();
      if (table_type) query = query.eq('table_type', table_type);
      if (active === 'true') query = query.eq('is_active', true);

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (method === 'POST') {
      requireRole(req.user, ['admin']);
      const { name, table_type: tType, source_file_name, table_data, effective_from, is_active } = req.body;

      if (!name || !tType) {
        return res.status(400).json({ error: 'Nome e tipo da tabela são obrigatórios' });
      }

      if (!['oab', 'escritorio'].includes(tType)) {
        return res.status(400).json({ error: 'Tipo deve ser "oab" ou "escritorio"' });
      }

      const payload = {
        name,
        table_type: tType,
        source_file_name: source_file_name || null,
        table_data: Array.isArray(table_data) ? table_data : [],
        is_active: is_active !== undefined ? is_active : true,
        effective_from: effective_from || new Date().toISOString().split('T')[0],
        created_by: req.user.id
      };

      const { data, error } = await supabaseAdmin
        .from('fee_uploaded_tables')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      await logAudit(req.user.id, 'fee_uploaded_tables', data.id, 'create', null, data);
      return res.status(201).json(data);
    }

    if (method === 'DELETE') {
      requireRole(req.user, ['admin']);
      if (!id) return res.status(400).json({ error: 'ID obrigatório' });

      const { data: old } = await supabaseAdmin.from('fee_uploaded_tables').select('*').eq('id', id).single();
      const { error } = await supabaseAdmin.from('fee_uploaded_tables').delete().eq('id', id);
      if (error) throw error;

      await logAudit(req.user.id, 'fee_uploaded_tables', id, 'delete', old, null);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (error) {
    console.error('[FEE-TABLES] Erro:', error);
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
