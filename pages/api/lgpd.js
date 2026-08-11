import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export default async function handler(req, res) {
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
    console.error('[LGPD] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

async function handleGet(req, res) {
  const { action, conversation_id } = req.query;

  try {
    if (action === 'expired_leads') {
      // Lista leads expirados conforme política de retenção
      const { data, error } = await supabase
        .from('expired_leads')
        .select('*');

      if (error) throw error;

      return res.status(200).json({
        total: data?.length || 0,
        leads: data || []
      });
    } else if (action === 'retention_policies') {
      // Lista políticas de retenção ativas
      const { data, error } = await supabase
        .from('data_retention_policy')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;

      return res.status(200).json(data || []);
    } else if (action === 'consent_history') {
      // Histórico de consentimentos de uma conversa
      if (!conversation_id) {
        return res.status(400).json({ error: 'conversation_id é obrigatório' });
      }

      const { data, error } = await supabase
        .from('consent_logs')
        .select('*')
        .eq('conversation_id', conversation_id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return res.status(200).json(data || []);
    } else if (action === 'anonymized_records') {
      // Registros de anonimizações
      const { data, error } = await supabase
        .from('anonymized_data')
        .select('*')
        .order('anonymized_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      return res.status(200).json(data || []);
    }
  } catch (error) {
    console.error('[LGPD] Erro ao buscar:', error);
    return res.status(500).json({ error: 'Erro ao buscar dados' });
  }
}

async function handlePost(req, res) {
  const { action } = req.body;

  try {
    if (action === 'mark_confidential') {
      const { conversation_id, reason, user_id } = req.body;

      if (!conversation_id) {
        return res.status(400).json({ error: 'conversation_id é obrigatório' });
      }

      const { error } = await supabase
        .from('conversations')
        .update({
          confidential: true,
          confidential_reason: reason || null,
          confidential_marked_by: user_id || null,
          confidential_marked_at: new Date().toISOString()
        })
        .eq('id', conversation_id);

      if (error) throw error;

      // Registra auditoria
      await supabase.rpc('log_audit', {
        p_user_id: user_id || null,
        p_entity_type: 'conversation',
        p_entity_id: conversation_id,
        p_action: 'mark_confidential',
        p_old_value: 'false',
        p_new_value: 'true',
        p_details: JSON.stringify({ reason })
      });

      console.log(`[LGPD] Conversa ${conversation_id} marcada como confidencial`);
      return res.status(200).json({ success: true });
    } else if (action === 'anonymize_lead') {
      const { conversation_id, reason, user_id } = req.body;

      if (!conversation_id) {
        return res.status(400).json({ error: 'conversation_id é obrigatório' });
      }

      // Executa função de anonimização
      const { error } = await supabase.rpc('anonymize_lead', {
        p_conversation_id: conversation_id,
        p_reason: reason || null
      });

      if (error) throw error;

      // Registra auditoria
      await supabase.rpc('log_audit', {
        p_user_id: user_id || null,
        p_entity_type: 'conversation',
        p_entity_id: conversation_id,
        p_action: 'anonymize_lead',
        p_old_value: null,
        p_new_value: 'anonymized',
        p_details: JSON.stringify({ reason })
      });

      console.log(`[LGPD] Lead ${conversation_id} anonimizado`);
      return res.status(200).json({ success: true, message: 'Lead anonimizado com sucesso' });
    } else if (action === 'mark_sensitive_message') {
      const { message_id, reason, user_id } = req.body;

      if (!message_id) {
        return res.status(400).json({ error: 'message_id é obrigatório' });
      }

      const { error } = await supabase
        .from('messages')
        .update({
          is_sensitive: true,
          sensitive_reason: reason || null
        })
        .eq('id', message_id);

      if (error) throw error;

      console.log(`[LGPD] Mensagem ${message_id} marcada como sensível`);
      return res.status(200).json({ success: true });
    } else if (action === 'log_consent') {
      const { conversation_id, consent_type, value, ip_address, user_agent } = req.body;

      if (!conversation_id || !consent_type) {
        return res.status(400).json({ error: 'conversation_id e consent_type são obrigatórios' });
      }

      const { error } = await supabase
        .from('consent_logs')
        .insert({
          conversation_id,
          consent_type,
          value: value || false,
          ip_address: ip_address || null,
          user_agent: user_agent || null
        });

      if (error) throw error;

      console.log(`[LGPD] Consentimento registrado: ${conversation_id} - ${consent_type}`);
      return res.status(201).json({ success: true });
    }
  } catch (error) {
    console.error('[LGPD] Erro ao processar:', error);
    return res.status(500).json({ error: 'Erro ao processar ação' });
  }
}

async function handlePatch(req, res) {
  const { action } = req.body;

  try {
    if (action === 'unmark_confidential') {
      const { conversation_id, user_id } = req.body;

      if (!conversation_id) {
        return res.status(400).json({ error: 'conversation_id é obrigatório' });
      }

      const { error } = await supabase
        .from('conversations')
        .update({
          confidential: false,
          confidential_reason: null,
          confidential_marked_by: null,
          confidential_marked_at: null
        })
        .eq('id', conversation_id);

      if (error) throw error;

      // Registra auditoria
      await supabase.rpc('log_audit', {
        p_user_id: user_id || null,
        p_entity_type: 'conversation',
        p_entity_id: conversation_id,
        p_action: 'unmark_confidential',
        p_old_value: 'true',
        p_new_value: 'false'
      });

      console.log(`[LGPD] Conversa ${conversation_id} desmarcada como confidencial`);
      return res.status(200).json({ success: true });
    }
  } catch (error) {
    console.error('[LGPD] Erro ao atualizar:', error);
    return res.status(500).json({ error: 'Erro ao atualizar' });
  }
}
