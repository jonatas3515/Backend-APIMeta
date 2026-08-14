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

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (!data) {
        return res.status(200).json({
          enabled: true,
          notify_messages: true,
          notify_deadlines: true,
          notify_assignments: true,
          notify_reminders: true,
          notify_checklist: false,
          silent_start: null,
          silent_end: null
        });
      }

      return res.status(200).json(data);
    } catch (error) {
      console.error('[NOTIFICATION PREFS] Erro ao buscar:', error);
      return res.status(500).json({ error: 'Erro ao buscar preferências' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const updates = req.body || {};
      const allowed = {};

      const fields = [
        'enabled',
        'notify_messages',
        'notify_deadlines',
        'notify_assignments',
        'notify_reminders',
        'notify_checklist',
        'silent_start',
        'silent_end',
        'ask_again_after'
      ];

      for (const field of fields) {
        if (updates[field] !== undefined) {
          allowed[field] = updates[field];
        }
      }

      const { data: existing } = await supabase
        .from('user_notification_preferences')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (existing) {
        const { data, error } = await supabase
          .from('user_notification_preferences')
          .update(allowed)
          .eq('user_id', userId)
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json(data);
      } else {
        const { data, error } = await supabase
          .from('user_notification_preferences')
          .insert({
            user_id: userId,
            ...allowed
          })
          .select()
          .single();

        if (error) throw error;
        return res.status(201).json(data);
      }
    } catch (error) {
      console.error('[NOTIFICATION PREFS] Erro ao atualizar:', error);
      return res.status(500).json({ error: 'Erro ao atualizar preferências' });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
}

export default withAuth(handler, { minRole: 'estagiario' });
