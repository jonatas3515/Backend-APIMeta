import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { validateAndNormalizeCNJ, resolveDataJudAlias } from '@/lib/datajudClient';

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
    if (method === 'GET') return await handleGet(req, res);
    if (method === 'POST') return await handlePost(req, res);
    if (method === 'PATCH') return await handlePatch(req, res);
    if (method === 'DELETE') return await handleDelete(req, res);
    return res.status(405).json({ error: 'Método não permitido' });
  } catch (error) {
    console.error('[CASE-PROCESSES] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });

async function handleGet(req, res) {
  const { case_id, id } = req.query;

  try {
    if (id) {
      const { data, error } = await supabase
        .from('case_processes')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Processo não encontrado' });
      return res.status(200).json(data);
    }

    if (!case_id) {
      return res.status(400).json({ error: 'case_id é obrigatório' });
    }

    const { data, error } = await supabase
      .from('case_processes')
      .select('*')
      .eq('case_id', case_id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (error) {
    console.error('[CASE-PROCESSES] Erro ao listar:', error);
    return res.status(500).json({ error: 'Erro ao listar processos' });
  }
}

async function handlePost(req, res) {
  const {
    case_id,
    process_number,
    court_code,
    court_name,
    datajud_alias,
    branch,
    instance,
    court_unit,
    case_class,
    main_subject,
    client_role,
    is_primary,
    monitoring_status,
    monitoring_frequency,
    public_consultation_url,
    observation
  } = req.body;

  if (!case_id || !process_number) {
    return res.status(400).json({ error: 'case_id e process_number são obrigatórios' });
  }

  const validation = validateAndNormalizeCNJ(process_number);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const aliasRes = resolveDataJudAlias(court_code || datajud_alias);
  if (!aliasRes.ok) {
    return res.status(400).json({ error: aliasRes.error });
  }

  try {
    const insertData = {
      case_id,
      process_number: validation.formatted,
      process_number_normalized: validation.normalized,
      court_code: (court_code || '').toLowerCase(),
      court_name: court_name || null,
      datajud_alias: aliasRes.alias,
      branch: branch || null,
      instance: instance || null,
      court_unit: court_unit || null,
      case_class: case_class || null,
      main_subject: main_subject || null,
      client_role: client_role || 'outro',
      is_primary: is_primary || false,
      monitoring_status: monitoring_status || 'ativo',
      monitoring_frequency: monitoring_frequency || 'manual',
      public_consultation_url: public_consultation_url || null,
      next_check_at: null,
      created_by: req.user.id
    };

    const { data, error } = await supabase
      .from('case_processes')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[CASE-PROCESSES] Erro no insert:', error);
      return res.status(400).json({ error: 'Não foi possível salvar o processo. Verifique se já não está vinculado a este caso.' });
    }

    await audit('CREATE', data.id, req.user);
    return res.status(201).json(data);
  } catch (error) {
    console.error('[CASE-PROCESSES] Erro ao criar:', error);
    return res.status(500).json({ error: 'Erro ao salvar processo' });
  }
}

async function handlePatch(req, res) {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'id é obrigatório na URL' });
  }

  const allowed = [
    'court_code','court_name','datajud_alias','branch','instance','court_unit','case_class','main_subject','client_role','is_primary','monitoring_status','monitoring_frequency','last_checked_at','next_check_at','last_movement_at','last_movement_summary','public_consultation_url','last_error'
  ];

  const update = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo permitido para atualização' });
  }

  try {
    const { data, error } = await supabase
      .from('case_processes')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Processo não encontrado' });

    await audit('UPDATE', id, req.user, update);
    return res.status(200).json(data);
  } catch (error) {
    console.error('[CASE-PROCESSES] Erro ao atualizar:', error);
    return res.status(500).json({ error: 'Erro ao atualizar processo' });
  }
}

async function handleDelete(req, res) {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'id é obrigatório na URL' });
  }

  try {
    const { data, error } = await supabase
      .from('case_processes')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Processo não encontrado' });

    await audit('DELETE', id, req.user);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[CASE-PROCESSES] Erro ao deletar:', error);
    return res.status(500).json({ error: 'Erro ao remover processo' });
  }
}

async function audit(action, targetId, user, details = null) {
  try {
    await supabase.from('audit_logs').insert({
      action,
      table_name: 'case_processes',
      record_id: targetId,
      user_id: user.id,
      user_email: user.email,
      details
    });
  } catch (e) {
    console.error('[CASE-PROCESSES] Falha ao auditar:', e);
  }
}
