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

  const { method } = req;

  try {
    if (method === 'GET') {
      return handleGet(req, res);
    } else if (method === 'POST') {
      return handlePost(req, res);
    } else if (method === 'PATCH') {
      return handlePatch(req, res);
    } else {
      return res.status(405).json({ error: 'Método não permitido' });
    }
  } catch (error) {
    console.error('[COLLABORATION] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });

async function handleGet(req, res) {
  const { action, conversation_id, case_id } = req.query;

  try {
    if (action === 'users') {
      // Lista usuários ativos
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return res.status(200).json(data || []);
    } else if (action === 'notes') {
      // Lista notas de conversa/caso
      if (!conversation_id && !case_id) {
        return res.status(400).json({ error: 'conversation_id ou case_id é obrigatório' });
      }

      const convId = conversation_id && conversation_id !== 'null' ? conversation_id : null;
      const cId = case_id && case_id !== 'null' ? case_id : null;

      if (!convId && !cId) {
        return res.status(200).json([]);
      }

      let query = supabase.from('internal_notes').select(`
        id, text, is_visible_to_client, created_at, updated_at,
        user_id, users(name, email)
      `);

      if (convId) query = query.eq('conversation_id', convId);
      if (cId) query = query.eq('case_id', cId);

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data || []);
    } else if (action === 'audit') {
      // Lista histórico de auditoria
      const { entity_type, entity_id, limit = 50 } = req.query;

      if (!entity_type || !entity_id) {
        return res.status(400).json({ error: 'entity_type e entity_id são obrigatórios' });
      }

      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          id, action, old_value, new_value, created_at,
          user_id, users(name, email)
        `)
        .eq('entity_type', entity_type)
        .eq('entity_id', entity_id)
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

      if (error) throw error;
      return res.status(200).json(data || []);
    }
  } catch (error) {
    console.error('[COLLABORATION] Erro ao buscar:', error);
    return res.status(500).json({ error: 'Erro ao buscar dados' });
  }
}

async function handlePost(req, res) {
  const { action } = req.body;

  try {
    if (action === 'add_note') {
      const { conversation_id, case_id, text, is_visible_to_client, user_id } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'text é obrigatório' });
      }

      if (!conversation_id && !case_id) {
        return res.status(400).json({ error: 'conversation_id ou case_id é obrigatório' });
      }

      const { data, error } = await supabase
        .from('internal_notes')
        .insert({
          conversation_id: conversation_id || null,
          case_id: case_id || null,
          user_id: user_id || null,
          text,
          is_visible_to_client: is_visible_to_client || false
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`[COLLABORATION] Nota adicionada: ${data.id}`);
      return res.status(201).json(data);
    } else if (action === 'assign_user') {
      const { entity_type, entity_id, user_id, current_user_id } = req.body;

      if (!entity_type || !entity_id || !user_id) {
        return res.status(400).json({ error: 'entity_type, entity_id e user_id são obrigatórios' });
      }

      // Busca valor anterior
      let oldValue = null;
      if (entity_type === 'conversation') {
        const { data } = await supabase
          .from('conversations')
          .select('assigned_user_id')
          .eq('id', entity_id)
          .single();
        oldValue = data?.assigned_user_id;
      } else if (entity_type === 'case') {
        const { data } = await supabase
          .from('cases')
          .select('assigned_user_id')
          .eq('id', entity_id)
          .single();
        oldValue = data?.assigned_user_id;
      }

      // Atualiza
      const table = entity_type === 'conversation' ? 'conversations' : 'cases';
      const { error: updateError } = await supabase
        .from(table)
        .update({ assigned_user_id: user_id })
        .eq('id', entity_id);

      if (updateError) throw updateError;

      // Registra auditoria
      await supabase.rpc('log_audit', {
        p_user_id: current_user_id || null,
        p_entity_type: entity_type,
        p_entity_id: entity_id,
        p_action: 'change_assigned_user',
        p_old_value: oldValue?.toString(),
        p_new_value: user_id
      });

      console.log(`[COLLABORATION] ${entity_type} ${entity_id} atribuído a ${user_id}`);
      return res.status(200).json({ success: true, message: 'Usuário atribuído com sucesso' });
    }
  } catch (error) {
    console.error('[COLLABORATION] Erro ao processar:', error);
    return res.status(500).json({ error: 'Erro ao processar ação' });
  }
}

async function handlePatch(req, res) {
  const { action } = req.body;

  try {
    if (action === 'update_note') {
      const { note_id, text, is_visible_to_client } = req.body;

      if (!note_id) {
        return res.status(400).json({ error: 'note_id é obrigatório' });
      }

      const { data, error } = await supabase
        .from('internal_notes')
        .update({ text, is_visible_to_client })
        .eq('id', note_id)
        .select()
        .single();

      if (error) throw error;

      console.log(`[COLLABORATION] Nota atualizada: ${note_id}`);
      return res.status(200).json(data);
    }
  } catch (error) {
    console.error('[COLLABORATION] Erro ao atualizar:', error);
    return res.status(500).json({ error: 'Erro ao atualizar' });
  }
}
