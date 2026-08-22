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

export default withAuth(handler, { allowedRoles: ['admin', 'advogado'] });

async function handleGet(req, res) {
  const { case_type, legal_area, is_common, is_active } = req.query;

  try {
    let query = supabase
      .from('document_checklist_templates')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('case_type');

    if (case_type) query = query.eq('case_type', case_type);
    if (legal_area) query = query.eq('legal_area', legal_area);
    if (is_common !== undefined) query = query.eq('is_common', is_common === 'true');
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json(data || []);
  } catch (error) {
    console.error('[DOCUMENT_CHECKLIST_TEMPLATES] Erro ao listar templates:', error);
    return res.status(500).json({ error: 'Erro ao listar templates' });
  }
}

async function handlePost(req, res) {
  const {
    case_type,
    document_name,
    title,
    description,
    category,
    is_required,
    is_sensitive,
    sort_order,
    legal_area,
    is_common,
    conditional_on
  } = req.body;

  if (!case_type || !document_name) {
    return res.status(400).json({ error: 'case_type e document_name são obrigatórios' });
  }

  try {
    const { data, error } = await supabase
      .from('document_checklist_templates')
      .insert([{
        case_type,
        document_name,
        title: title || document_name,
        description: description || null,
        category: category || null,
        is_required: is_required !== undefined ? !!is_required : true,
        is_sensitive: is_sensitive !== undefined ? !!is_sensitive : false,
        sort_order: sort_order || 0,
        legal_area: legal_area || null,
        is_common: is_common !== undefined ? !!is_common : false,
        conditional_on: conditional_on || '[]',
        created_by: req.user.id,
        is_active: true
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
  const {
    document_name,
    title,
    description,
    category,
    is_required,
    is_sensitive,
    sort_order,
    is_active,
    legal_area,
    is_common,
    conditional_on
  } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'ID é obrigatório' });
  }

  try {
    const updates = {};
    if (document_name !== undefined) updates.document_name = document_name;
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (is_required !== undefined) updates.is_required = !!is_required;
    if (is_sensitive !== undefined) updates.is_sensitive = !!is_sensitive;
    if (sort_order !== undefined) updates.sort_order = sort_order;
    if (is_active !== undefined) updates.is_active = !!is_active;
    if (legal_area !== undefined) updates.legal_area = legal_area;
    if (is_common !== undefined) updates.is_common = !!is_common;
    if (conditional_on !== undefined) updates.conditional_on = conditional_on;
    updates.updated_by = req.user.id;

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
    const { data, error } = await supabase
      .from('document_checklist_templates')
      .update({ is_active: false, updated_by: req.user.id })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ success: true, message: 'Template desativado', data });
  } catch (error) {
    console.error('[DOCUMENT_CHECKLIST_TEMPLATES] Erro ao desativar template:', error);
    return res.status(500).json({ error: 'Erro ao desativar template' });
  }
}
