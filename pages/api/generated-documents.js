import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase nao configurado' });
  }

  const { method } = req;

  try {
    if (method === 'GET') {
      return handleGet(req, res);
    } else if (method === 'PATCH') {
      return handlePatch(req, res);
    } else if (method === 'DELETE') {
      return handleDelete(req, res);
    } else {
      return res.status(405).json({ error: 'Metodo nao permitido' });
    }
  } catch (error) {
    console.error('[GENERATED_DOCS] Erro interno');
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });

async function handleGet(req, res) {
  const { case_id, conversation_id, id } = req.query;

  try {
    if (id) {
      const { data, error } = await supabase
        .from('generated_documents')
        .select('*, document_templates(name, legal_area)')
        .eq('id', id)
        .single();

      if (error) throw error;
      return res.status(200).json(data);
    }

    if (case_id) {
      let query = supabase
        .from('generated_documents')
        .select('*, document_templates(name, legal_area)')
        .order('generated_at', { ascending: false });

      query = query.eq('case_id', case_id);

      const { data: directDocs, error: directError } = await query;
      if (directError) throw directError;

      if (conversation_id) {
        const { data: legacyDocs, error: legacyError } = await supabase
          .from('generated_documents')
          .select('*, document_templates(name, legal_area)')
          .eq('conversation_id', conversation_id)
          .is('case_id', null)
          .order('generated_at', { ascending: false });

        if (legacyError) throw legacyError;

        const combined = [
          ...(directDocs || []),
          ...(legacyDocs || []).map(doc => ({ ...doc, is_legacy: true }))
        ];

        return res.status(200).json(combined);
      }

      return res.status(200).json(directDocs || []);
    }

    if (conversation_id) {
      const { data, error } = await supabase
        .from('generated_documents')
        .select('*, document_templates(name, legal_area)')
        .eq('conversation_id', conversation_id)
        .order('generated_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    return res.status(400).json({ error: 'case_id ou conversation_id obrigatorio' });
  } catch (error) {
    console.error('[GENERATED_DOCS] Erro ao buscar');
    return res.status(500).json({ error: 'Erro ao buscar documentos' });
  }
}

async function handlePatch(req, res) {
  const { id } = req.query;
  const { status } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'ID obrigatorio' });
  }

  if (!status) {
    return res.status(400).json({ error: 'status obrigatorio' });
  }

  const validStatuses = ['draft', 'review', 'approved', 'sent'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'status invalido' });
  }

  try {
    const { data, error } = await supabase
      .from('generated_documents')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return res.status(200).json(data);
  } catch (error) {
    console.error('[GENERATED_DOCS] Erro ao atualizar');
    return res.status(500).json({ error: 'Erro ao atualizar documento' });
  }
}

async function handleDelete(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'ID obrigatorio' });
  }

  try {
    const { error } = await supabase
      .from('generated_documents')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return res.status(204).end();
  } catch (error) {
    console.error('[GENERATED_DOCS] Erro ao deletar');
    return res.status(500).json({ error: 'Erro ao deletar documento' });
  }
}
