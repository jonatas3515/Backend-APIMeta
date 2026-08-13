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
    console.error('[DOCUMENT_CHECKLISTS] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });

async function handleGet(req, res) {
  const { case_id, sync, pending_filter } = req.query;

  try {
    if (pending_filter === 'true') {
      const { data, error } = await supabase
        .from('case_document_checklists')
        .select('case_id')
        .neq('status', 'received')
        .neq('status', 'verified');

      if (error) throw error;

      const caseIds = [...new Set((data || []).map(item => item.case_id))];
      return res.status(200).json({ case_ids: caseIds });
    }

    if (!case_id) {
      return res.status(400).json({ error: 'case_id é obrigatório' });
    }

    if (sync === 'true') {
      await syncChecklistFromTemplates(case_id);
    }

    const { data, error } = await supabase
      .from('case_document_checklists')
      .select('*')
      .eq('case_id', case_id)
      .order('created_at');

    if (error) throw error;

    return res.status(200).json(data || []);
  } catch (error) {
    console.error('[DOCUMENT_CHECKLISTS] Erro ao listar checklist:', error);
    return res.status(500).json({ error: 'Erro ao listar checklist' });
  }
}

async function handlePost(req, res) {
  const { action } = req.query;
  const { case_id, document_name, status, media_url, media_type } = req.body;

  try {
    if (action === 'sync') {
      if (!case_id) {
        return res.status(400).json({ error: 'case_id é obrigatório' });
      }
      const result = await syncChecklistFromTemplates(case_id);
      return res.status(200).json(result);
    }

    if (!case_id || !document_name) {
      return res.status(400).json({ error: 'case_id e document_name são obrigatórios' });
    }

    const { data, error } = await supabase
      .from('case_document_checklists')
      .insert([{
        case_id,
        document_name,
        status: status || 'pending',
        media_url: media_url || null,
        media_type: media_type || null,
      }])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json(data);
  } catch (error) {
    console.error('[DOCUMENT_CHECKLISTS] Erro ao criar item:', error);
    return res.status(500).json({ error: 'Erro ao criar item' });
  }
}

async function handlePatch(req, res) {
  const { id } = req.query;
  const { status, media_url, media_type, document_name } = req.body;
  const userId = req.user?.id;

  if (!id) {
    return res.status(400).json({ error: 'ID é obrigatório' });
  }

  try {
    const updates = {};
    if (status !== undefined) updates.status = status;
    if (media_url !== undefined) updates.media_url = media_url;
    if (media_type !== undefined) updates.media_type = media_type;
    if (document_name !== undefined) updates.document_name = document_name;

    if (status === 'received' || status === 'verified') {
      updates.received_at = new Date().toISOString();
      updates.received_by = userId || null;
    } else if (status === 'pending') {
      updates.received_at = null;
      updates.received_by = null;
    }

    const { data, error } = await supabase
      .from('case_document_checklists')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Notificar advogado se checklist estiver completo
    if (status === 'received' || status === 'verified') {
      await maybeNotifyCompletion(data.case_id);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('[DOCUMENT_CHECKLISTS] Erro ao atualizar item:', error);
    return res.status(500).json({ error: 'Erro ao atualizar item' });
  }
}

async function handleDelete(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'ID é obrigatório' });
  }

  try {
    const { error } = await supabase
      .from('case_document_checklists')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return res.status(200).json({ success: true, message: 'Item removido' });
  } catch (error) {
    console.error('[DOCUMENT_CHECKLISTS] Erro ao deletar item:', error);
    return res.status(500).json({ error: 'Erro ao deletar item' });
  }
}

async function syncChecklistFromTemplates(caseId) {
  const { data: caseData, error: caseError } = await supabase
    .from('cases')
    .select('case_type')
    .eq('id', caseId)
    .single();

  if (caseError || !caseData || !caseData.case_type) {
    return { synced: false, reason: 'Caso não encontrado ou sem case_type' };
  }

  const { data: templates, error: templatesError } = await supabase
    .from('document_checklist_templates')
    .select('*')
    .eq('case_type', caseData.case_type);

  if (templatesError) throw templatesError;

  if (!templates || templates.length === 0) {
    return { synced: false, reason: 'Nenhum template encontrado', case_type: caseData.case_type };
  }

  const { data: existingItems, error: existingError } = await supabase
    .from('case_document_checklists')
    .select('document_name')
    .eq('case_id', caseId);

  if (existingError) throw existingError;

  const existingNames = new Set((existingItems || []).map(item => item.document_name));
  const missing = templates.filter(t => !existingNames.has(t.document_name));

  if (missing.length === 0) {
    return { synced: false, reason: 'Checklist já está sincronizado', added: 0 };
  }

  const toInsert = missing.map(t => ({
    case_id: caseId,
    document_name: t.document_name,
    status: 'pending'
  }));

  const { error: insertError } = await supabase
    .from('case_document_checklists')
    .insert(toInsert);

  if (insertError) throw insertError;

  return { synced: true, added: missing.length, case_type: caseData.case_type };
}

async function maybeNotifyCompletion(caseId) {
  try {
    const { data: items, error } = await supabase
      .from('case_document_checklists')
      .select('status')
      .eq('case_id', caseId);

    if (error || !items || items.length === 0) return;

    const pending = items.filter(i => i.status !== 'received' && i.status !== 'verified');
    if (pending.length > 0) return;

    console.log(`[DOCUMENT_CHECKLISTS] ✅ Checklist completo para o caso ${caseId}`);
    // Aqui poderia ser enviada notificação por e-mail/WhatsApp no futuro
  } catch (error) {
    console.error('[DOCUMENT_CHECKLISTS] Erro ao verificar conclusão:', error);
  }
}
