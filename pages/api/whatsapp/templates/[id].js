import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { normalizeTemplate } from '@/lib/whatsapp-templates';
import logger from '@/lib/logger';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Serviço indisponível' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res);
  }

  logger('warn', 'WHATSAPP_TEMPLATE_DETAIL_INVALID_METHOD', { httpStatus: 405, userId: req.user?.id });
  return res.status(405).json({ error: 'Método não permitido' });
}

async function handleGet(req, res) {
  const { id } = req.query;
  const user = req.user;

  try {
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .select('id, name, category, content, variables, status, created_at')
      .eq('id', id)
      .single();

    if (error || !data) {
      logger('warn', 'WHATSAPP_TEMPLATE_DETAIL_NOT_FOUND', { httpStatus: 404, userId: user.id });
      return res.status(404).json({ error: 'Template não encontrado' });
    }

    logger('info', 'WHATSAPP_TEMPLATE_DETAIL_SUCCESS', { httpStatus: 200, userId: user.id });
    return res.status(200).json(normalizeTemplate(data));
  } catch (error) {
    logger('error', 'WHATSAPP_TEMPLATE_DETAIL_ERROR', { httpStatus: 500, userId: user.id });
    return res.status(500).json({ error: 'Erro ao buscar template' });
  }
}

async function handleDelete(req, res) {
  const { id } = req.query;
  const user = req.user;

  try {
    const { data: existing, error: findError } = await supabase
      .from('whatsapp_templates')
      .select('id, name')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      logger('warn', 'WHATSAPP_TEMPLATE_DELETE_NOT_FOUND', { httpStatus: 404, userId: user.id });
      return res.status(404).json({ error: 'Template não encontrado' });
    }

    const { error: deleteError } = await supabase
      .from('whatsapp_templates')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    await supabase.rpc('log_audit', {
      p_user_id: user.id,
      p_entity_type: 'whatsapp_template',
      p_entity_id: id,
      p_action: 'delete_template',
      p_old_value: existing.name,
      p_new_value: null,
      p_details: JSON.stringify({ name: existing.name })
    });

    logger('info', 'WHATSAPP_TEMPLATE_DELETE_SUCCESS', { httpStatus: 200, userId: user.id });
    return res.status(200).json({ success: true });
  } catch (error) {
    logger('error', 'WHATSAPP_TEMPLATE_DELETE_ERROR', { httpStatus: 500, userId: user.id });
    return res.status(500).json({ error: 'Erro ao excluir template' });
  }
}

export default withAuth(handler, { minRole: 'advogado' });
