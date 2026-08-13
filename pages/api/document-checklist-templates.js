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
    } else if (method === 'DELETE') {
      return handleDelete(req, res);
    } else {
      return res.status(405).json({ error: 'Método não permitido' });
    }
  } catch (error) {
    console.error('[DOCUMENT_CHECKLIST_TEMPLATES] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export default withAuth(handler, { allowedRoles: ['admin'] });

async function handleGet(req, res) {
  const { case_type } = req.query;

  try {
    let query = supabase
      .from('document_checklist_templates')
      .select('*')
      .order('case_type')
      .order('document_name');

    if (case_type) {
      query = query.eq('case_type', case_type);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json(data || []);
  } catch (error) {
    console.error('[DOCUMENT_CHECKLIST_TEMPLATES] Erro ao listar templates:', error);
    return res.status(500).json({ error: 'Erro ao listar templates' });
  }
}

async function handlePost(req, res) {
  const { case_type, document_name, required = true } = req.body;

  if (!case_type || !document_name) {
    return res.status(400).json({ error: 'case_type e document_name são obrigatórios' });
  }

  try {
    const { data, error } = await supabase
      .from('document_checklist_templates')
      .insert([{
        case_type,
        document_name,
        required
      }])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json(data);
  } catch (error) {
    console.error('[DOCUMENT_CHECKLIST_TEMPLATES] Erro ao criar template:', error);
    return res.status(500).json({ error: 'Erro ao criar template' });
  }
}

async function handlePatch(req, res) {
  const { id } = req.query;
  const { document_name, required } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'ID é obrigatório' });
  }

  try {
    const updates = {};
    if (document_name !== undefined) updates.document_name = document_name;
    if (required !== undefined) updates.required = required;

    const { data, error } = await supabase
      .from('document_checklist_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json(data);
  } catch (error) {
    console.error('[DOCUMENT_CHECKLIST_TEMPLATES] Erro ao atualizar template:', error);
    return res.status(500).json({ error: 'Erro ao atualizar template' });
  }
}

async function handleDelete(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'ID é obrigatório' });
  }

  try {
    const { error } = await supabase
      .from('document_checklist_templates')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return res.status(200).json({ success: true, message: 'Template removido' });
  } catch (error) {
    console.error('[DOCUMENT_CHECKLIST_TEMPLATES] Erro ao deletar template:', error);
    return res.status(500).json({ error: 'Erro ao deletar template' });
  }
}
