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
    console.error('[TEMPLATES] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });

async function handleGet(req, res) {
  const { id, legal_area, case_type, action } = req.query;

  try {
    if (action === 'generate') {
      // Gera documento a partir de template
      const { template_id, conversation_id } = req.query;

      if (!template_id || !conversation_id) {
        return res.status(400).json({ error: 'template_id e conversation_id são obrigatórios' });
      }

      // Busca template
      const { data: template, error: templateError } = await supabase
        .from('document_templates')
        .select('*')
        .eq('id', template_id)
        .single();

      if (templateError || !template) {
        return res.status(404).json({ error: 'Template não encontrado' });
      }

      // Busca conversa para preencher placeholders
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversation_id)
        .single();

      if (convError || !conversation) {
        return res.status(404).json({ error: 'Conversa não encontrada' });
      }

      // Substitui placeholders
      let content = template.template_text;
      const placeholders = {
        client_name: conversation.client_name || '[Nome do Cliente]',
        client_phone: conversation.client_phone || '[Telefone]',
        municipality: conversation.municipality || '[Município]',
        agency: conversation.agency || '[Órgão/Entidade]',
        client_role: conversation.client_role || '[Papel do Cliente]',
        case_type: conversation.case_type || '[Tipo de Caso]',
        legal_area: conversation.legal_area || '[Área Jurídica]',
        case_summary: conversation.case_summary || '[Resumo do Caso]',
        date: new Date().toLocaleDateString('pt-BR'),
        year: new Date().getFullYear().toString()
      };

      Object.entries(placeholders).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        content = content.replace(regex, value);
      });

      // Salva documento gerado
      const { data: doc, error: docError } = await supabase
        .from('generated_documents')
        .insert({
          conversation_id,
          template_id,
          title: template.name,
          content,
          status: 'draft'
        })
        .select()
        .single();

      if (docError) throw docError;

      return res.status(200).json(doc);
    } else if (id) {
      // Retorna template específico
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      return res.status(200).json(data);
    } else {
      // Lista templates com filtros
      let query = supabase.from('document_templates').select('*');

      if (legal_area) query = query.eq('legal_area', legal_area);
      if (case_type) query = query.eq('case_type', case_type);
      query = query.eq('is_active', true);
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      return res.status(200).json(data || []);
    }
  } catch (error) {
    console.error('[TEMPLATES] Erro ao buscar:', error);
    return res.status(500).json({ error: 'Erro ao buscar templates' });
  }
}

async function handlePost(req, res) {
  const { name, description, legal_area, case_type, template_text, placeholders } = req.body;

  if (!name || !template_text) {
    return res.status(400).json({ error: 'name e template_text são obrigatórios' });
  }

  try {
    const { data, error } = await supabase
      .from('document_templates')
      .insert({
        name,
        description: description || null,
        legal_area: legal_area || null,
        case_type: case_type || null,
        template_text,
        placeholders: placeholders || [],
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[TEMPLATES] Template criado: ${data.id}`);
    return res.status(201).json(data);
  } catch (error) {
    console.error('[TEMPLATES] Erro ao criar template:', error);
    return res.status(500).json({ error: 'Erro ao criar template' });
  }
}

async function handlePatch(req, res) {
  const { id } = req.query;
  const updates = req.body;

  if (!id) {
    return res.status(400).json({ error: 'ID é obrigatório' });
  }

  try {
    const { data, error } = await supabase
      .from('document_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    console.log(`[TEMPLATES] Template atualizado: ${id}`);
    return res.status(200).json(data);
  } catch (error) {
    console.error('[TEMPLATES] Erro ao atualizar template:', error);
    return res.status(500).json({ error: 'Erro ao atualizar template' });
  }
}

async function handleDelete(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'ID é obrigatório' });
  }

  try {
    // Soft delete: marca como inativo em vez de deletar
    const { error } = await supabase
      .from('document_templates')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;

    console.log(`[TEMPLATES] Template desativado: ${id}`);
    return res.status(200).json({ success: true, message: 'Template desativado' });
  } catch (error) {
    console.error('[TEMPLATES] Erro ao deletar template:', error);
    return res.status(500).json({ error: 'Erro ao deletar template' });
  }
}
