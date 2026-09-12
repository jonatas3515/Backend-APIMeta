import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { validateTemplate, normalizeTemplate } from '@/lib/whatsapp-templates';
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

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  logger('warn', 'WHATSAPP_TEMPLATE_INVALID_METHOD', { httpStatus: 405, userId: req.user?.id });
  return res.status(405).json({ error: 'Método não permitido' });
}

async function handleGet(req, res) {
  const user = req.user;

  try {
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .select('id, name, category, content, variables, status, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const result = (data || []).map(normalizeTemplate);

    logger('info', 'WHATSAPP_TEMPLATE_LIST_SUCCESS', { httpStatus: 200, userId: user.id, count: result.length });
    return res.status(200).json(result);
  } catch (error) {
    logger('error', 'WHATSAPP_TEMPLATE_LIST_ERROR', { httpStatus: 500, userId: user.id });
    return res.status(500).json({ error: 'Erro ao listar templates' });
  }
}

async function handlePost(req, res) {
  const user = req.user;
  const { name, category, content, variables, status = 'draft' } = req.body;

  const validation = validateTemplate({ name, category, content, variables, status });
  if (!validation.valid) {
    logger('warn', 'WHATSAPP_TEMPLATE_CREATE_VALIDATION', { httpStatus: 400, userId: user.id });
    return res.status(400).json({ error: validation.errors.join('; ') });
  }

  try {
    const insert = {
      name,
      category,
      content,
      variables: variables.map(String),
      status,
      created_by: user.id,
      created_at: new Date().toISOString()
    };

    const { data: created, error: insertError } = await supabase
      .from('whatsapp_templates')
      .insert(insert)
      .select('id, name, category, content, variables, status, created_at')
      .single();

    if (insertError) throw insertError;

    await supabase.rpc('log_audit', {
      p_user_id: user.id,
      p_entity_type: 'whatsapp_template',
      p_entity_id: created.id,
      p_action: 'create_template',
      p_old_value: null,
      p_new_value: status,
      p_details: JSON.stringify({ name, category, status })
    });

    logger('info', 'WHATSAPP_TEMPLATE_CREATE_SUCCESS', { httpStatus: 201, userId: user.id });
    return res.status(201).json(normalizeTemplate(created));
  } catch (error) {
    logger('error', 'WHATSAPP_TEMPLATE_CREATE_ERROR', { httpStatus: 500, userId: user.id });
    return res.status(500).json({ error: 'Erro ao criar template' });
  }
}

export default withAuth(handler, { minRole: 'advogado' });
