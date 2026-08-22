import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { normalizeLegalArea } from '@/lib/legalAreas';
import { isValidStatusForEstagiario, RESTRICTED_FIELDS_FOR_ESTAGIARIO } from '@/lib/documentChecklists';

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
      return await handleGet(req, res);
    } else if (method === 'POST') {
      return await handlePost(req, res);
    } else if (method === 'PATCH') {
      return await handlePatch(req, res);
    } else if (method === 'DELETE') {
      return await handleDelete(req, res);
    } else {
      return res.status(405).json({ error: 'Metodo nao permitido' });
    }
  } catch (error) {
    console.error('[DOCUMENT_CHECKLISTS] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });

async function canAccessCase(caseId, user) {
  if (user.role === 'admin' || user.role === 'advogado') return true;
  const { data, error } = await supabase
    .from('cases')
    .select('assigned_user_id')
    .eq('id', caseId)
    .single();
  if (error || !data) return false;
  return data.assigned_user_id === user.id;
}

async function handleGet(req, res) {
  const { case_id, sync } = req.query;

  try {
    if (!case_id) {
      return res.status(400).json({ error: 'case_id e obrigatorio' });
    }

    const accessible = await canAccessCase(case_id, req.user);
    if (!accessible) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (sync === 'true') {
      await syncChecklistFromTemplates(case_id, req.user);
    }

    const { data, error } = await supabase
      .from('case_document_checklists')
      .select('*, documents:case_documents(*), template:template_id(*)')
      .eq('case_id', case_id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;

    return res.status(200).json(data || []);
  } catch (error) {
    console.error('[DOCUMENT_CHECKLISTS] Erro ao listar checklist:', error);
    return res.status(500).json({ error: 'Erro ao listar checklist' });
  }
}

async function handlePost(req, res) {
  const { action } = req.query;
  const { case_id } = req.body;
  const user = req.user;

  if (action === 'sync') {
    if (!case_id) {
      return res.status(400).json({ error: 'case_id e obrigatorio' });
    }
    const accessible = await canAccessCase(case_id, user);
    if (!accessible) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const result = await syncChecklistFromTemplates(case_id, user);
    return res.status(200).json(result);
  }

  // Apenas admin/advogado podem criar itens manuais
  if (user.role === 'estagiario') {
    return res.status(403).json({ error: 'Estagiario nao pode criar itens de checklist' });
  }

  const { document_name, title, category, is_required, is_sensitive, sort_order } = req.body;

  if (!case_id || !document_name) {
    return res.status(400).json({ error: 'case_id e document_name sao obrigatorios' });
  }

  const accessible = await canAccessCase(case_id, user);
  if (!accessible) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  try {
    const { data, error } = await supabase
      .from('case_document_checklists')
      .insert([{
        case_id,
        document_name,
        title: title || document_name,
        category: category || null,
        is_required: is_required !== undefined ? !!is_required : true,
        is_sensitive: is_sensitive !== undefined ? !!is_sensitive : false,
        sort_order: sort_order || 0,
        is_manual: true,
        status: 'pendente'
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
  const user = req.user;
  const updates = req.body;

  if (!id) {
    return res.status(400).json({ error: 'ID e obrigatorio' });
  }

  try {
    const { data: current, error: fetchError } = await supabase
      .from('case_document_checklists')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
      return res.status(404).json({ error: 'Item nao encontrado' });
    }

    const accessible = await canAccessCase(current.case_id, user);
    if (!accessible) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (user.role === 'estagiario') {
      const restricted = Object.keys(updates).some(k => RESTRICTED_FIELDS_FOR_ESTAGIARIO.has(k));
      if (restricted) {
        return res.status(403).json({ error: 'Estagiario nao pode alterar esse campo' });
      }

      const newStatus = updates.status;
      if (newStatus && !isValidStatusForEstagiario(newStatus)) {
        return res.status(403).json({ error: 'Estagiario so pode marcar recebido ou em_revisao' });
      }

      if (current.is_sensitive) {
        return res.status(403).json({ error: 'Item sensivel: estagiario nao pode alterar' });
      }
    }

    const allowedUpdates = {};
    const allowedFields = [
      'status', 'observacao', 'title', 'description', 'category',
      'is_required', 'is_sensitive', 'sort_order', 'requested_at', 'requested_by',
      'reviewed_at', 'reviewed_by', 'dispensed_at', 'dispensed_by', 'dispense_reason'
    ];

    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        allowedUpdates[key] = updates[key];
      }
    }

    const newStatus = allowedUpdates.status;
    const now = new Date().toISOString();

    if (newStatus === 'recebido' || newStatus === 'em_revisao') {
      allowedUpdates.received_at = now;
      allowedUpdates.received_by = user.id;
    }

    if (newStatus === 'revisado' || newStatus === 'recusado' || newStatus === 'dispensado') {
      allowedUpdates.reviewed_at = now;
      allowedUpdates.reviewed_by = user.id;
    }

    if (newStatus === 'dispensado') {
      if (!allowedUpdates.dispense_reason) {
        return res.status(400).json({ error: 'Justificativa e obrigatoria para dispensar' });
      }
      allowedUpdates.dispensed_at = now;
      allowedUpdates.dispensed_by = user.id;
    }

    if (newStatus === 'solicitado') {
      allowedUpdates.requested_at = now;
      allowedUpdates.requested_by = user.id;
    }

    const { data, error } = await supabase
      .from('case_document_checklists')
      .update(allowedUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (newStatus && newStatus !== current.status) {
      await supabase.from('document_review_logs').insert([{
        case_document_checklist_id: id,
        reviewed_by: user.id,
        reviewed_at: now,
        previous_status: current.status,
        new_status: newStatus,
        observacao: allowedUpdates.observacao || null
      }]);
    }

    if (newStatus === 'recebido' || newStatus === 'em_revisao') {
      await maybeNotifyCompletion(current.case_id);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('[DOCUMENT_CHECKLISTS] Erro ao atualizar item:', error);
    return res.status(500).json({ error: 'Erro ao atualizar item' });
  }
}

async function handleDelete(req, res) {
  const { id } = req.query;
  const user = req.user;

  if (!id) {
    return res.status(400).json({ error: 'ID e obrigatorio' });
  }

  if (user.role === 'estagiario') {
    return res.status(403).json({ error: 'Estagiario nao pode excluir itens' });
  }

  try {
    const { data: current, error: fetchError } = await supabase
      .from('case_document_checklists')
      .select('case_id')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
      return res.status(404).json({ error: 'Item nao encontrado' });
    }

    const accessible = await canAccessCase(current.case_id, user);
    if (!accessible) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

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

async function syncChecklistFromTemplates(caseId, user) {
  const { data: caseData, error: caseError } = await supabase
    .from('cases')
    .select('case_type, legal_area')
    .eq('id', caseId)
    .single();

  if (caseError || !caseData) {
    return { synced: false, reason: 'Caso nao encontrado' };
  }

  const normalizedArea = normalizeLegalArea(caseData.legal_area);
  const caseType = (caseData.case_type || '').trim();

  let query = supabase
    .from('document_checklist_templates')
    .select('*')
    .eq('is_active', true)
    .or('is_common.eq.true' + (normalizedArea ? `,legal_area.eq.${normalizedArea}` : ''));

  if (caseType) {
    query = query.or(`case_type.eq.${caseType},case_type.eq.geral`);
  } else {
    query = query.eq('is_common', true);
  }

  query = query.order('sort_order', { ascending: true });

  const { data: templates, error: templatesError } = await query;

  if (templatesError) throw templatesError;

  if (!templates || templates.length === 0) {
    return { synced: false, reason: 'Nenhum template encontrado', case_type: caseType, legal_area: normalizedArea };
  }

  const { data: existingItems, error: existingError } = await supabase
    .from('case_document_checklists')
    .select('template_id')
    .eq('case_id', caseId);

  if (existingError) throw existingError;

  const existingTemplateIds = new Set((existingItems || []).map(i => i.template_id).filter(Boolean));
  const missing = templates.filter(t => t.id && !existingTemplateIds.has(t.id));

  if (missing.length === 0) {
    return { synced: false, reason: 'Checklist ja sincronizado', added: 0 };
  }

  const toInsert = missing.map(t => ({
    case_id: caseId,
    template_id: t.id,
    document_name: t.document_name,
    title: t.title || t.document_name,
    description: t.description || null,
    category: t.category || null,
    is_required: t.is_required !== undefined ? t.is_required : true,
    is_sensitive: t.is_sensitive !== undefined ? t.is_sensitive : false,
    sort_order: t.sort_order || 0,
    status: 'pendente'
  }));

  const { error: insertError } = await supabase
    .from('case_document_checklists')
    .insert(toInsert);

  if (insertError) throw insertError;

  return { synced: true, added: missing.length, case_type: caseType, legal_area: normalizedArea };
}

async function maybeNotifyCompletion(caseId) {
  try {
    const { data: items, error } = await supabase
      .from('case_document_checklists')
      .select('status')
      .eq('case_id', caseId);

    if (error || !items || items.length === 0) return;

    const pending = items.filter(i => !['revisado', 'dispensado'].includes(i.status));
    if (pending.length > 0) return;

    console.log(`[DOCUMENT_CHECKLISTS] ✅ Checklist concluido para o caso ${caseId}`);
  } catch (error) {
    console.error('[DOCUMENT_CHECKLISTS] Erro ao verificar conclusao:', error);
  }
}
