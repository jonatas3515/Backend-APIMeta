import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { getSignedUrl, uploadCaseFile } from '@/lib/storage';

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
  const user = req.user;

  try {
    if (method === 'GET') {
      return await handleGet(req, res, user);
    } else if (method === 'POST') {
      return await handlePost(req, res, user);
    } else if (method === 'PATCH') {
      return await handlePatch(req, res, user);
    } else if (method === 'DELETE') {
      return await handleDelete(req, res, user);
    } else {
      return res.status(405).json({ error: 'Metodo nao permitido' });
    }
  } catch (error) {
    console.error('[CASE_DOCUMENTS] Erro:', error.message);
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

async function canAccessDocument(docId, user) {
  if (user.role === 'admin' || user.role === 'advogado') return true;

  const { data: doc, error } = await supabase
    .from('case_documents')
    .select('is_sensitive, case_id')
    .eq('id', docId)
    .single();

  if (error || !doc || doc.is_sensitive) return false;

  return canAccessCase(doc.case_id, user);
}

function sanitizeForLog(value) {
  if (!value || typeof value !== 'string') return value;
  if (value.length <= 16) return '[redacted]';
  return value.slice(0, 4) + '...[redacted]...' + value.slice(-4);
}

async function handleGet(req, res, user) {
  const { id, case_id, download } = req.query;

  try {
    if (id) {
      const allowed = await canAccessDocument(id, user);
      if (!allowed) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { data: doc, error } = await supabase
        .from('case_documents')
        .select('*, checklist_item:checklist_item_id(id, title, status)')
        .eq('id', id)
        .single();

      if (error || !doc) {
        return res.status(404).json({ error: 'Documento nao encontrado' });
      }

      const result = { ...doc };
      delete result.storage_path;

      if (download === '1') {
        const signedUrl = await getSignedUrl(doc.storage_bucket, doc.storage_path, 120);
        result.signed_url = signedUrl;
      }

      return res.status(200).json(result);
    }

    if (!case_id) {
      return res.status(400).json({ error: 'id ou case_id e obrigatorio' });
    }

    const accessible = await canAccessCase(case_id, user);
    if (!accessible) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    let query = supabase
      .from('case_documents')
      .select('*, checklist_item:checklist_item_id(id, title, status)')
      .eq('case_id', case_id)
      .order('created_at', { ascending: false });

    if (user.role === 'estagiario') {
      query = query.eq('is_sensitive', false);
    }

    const { data, error } = await query;

    if (error) throw error;

    const result = (data || []).map(d => {
      const item = { ...d };
      delete item.storage_path;
      return item;
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('[CASE_DOCUMENTS] Erro ao buscar documentos:', error.message);
    return res.status(500).json({ error: 'Erro ao buscar documentos' });
  }
}

async function handlePost(req, res, user) {
  if (user.role === 'estagiario') {
    return res.status(403).json({ error: 'Estagiario nao pode adicionar documentos' });
  }

  const {
    case_id,
    conversation_id,
    base64,
    mime_type,
    original_filename,
    origin = 'upload',
    checklist_item_id,
    is_sensitive
  } = req.body;

  if (!case_id || !base64 || !mime_type || !original_filename) {
    return res.status(400).json({ error: 'case_id, base64, mime_type e original_filename sao obrigatorios' });
  }

  const accessible = await canAccessCase(case_id, user);
  if (!accessible) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  try {
    const buffer = Buffer.from(base64, 'base64');
    const safeName = original_filename
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .toLowerCase();

    const documentId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const path = `cases/${case_id}/${documentId}/${safeName}`;

    const storagePath = await uploadCaseFile(path, buffer, mime_type);
    if (!storagePath) {
      throw new Error('Falha no upload');
    }

    const insert = {
      case_id,
      conversation_id: conversation_id || null,
      checklist_item_id: checklist_item_id || null,
      storage_bucket: 'chat-files',
      storage_path: storagePath,
      origin,
      mime_type,
      file_size: buffer.length,
      original_filename,
      uploaded_by: user.id,
      received_at: new Date().toISOString(),
      is_sensitive: !!is_sensitive
    };

    const { data: doc, error } = await supabase
      .from('case_documents')
      .insert([insert])
      .select()
      .single();

    if (error) throw error;

    console.log(`[CASE_DOCUMENTS] Documento registrado: ${doc.id}`);
    const result = { ...doc };
    delete result.storage_path;
    return res.status(201).json(result);
  } catch (error) {
    console.error('[CASE_DOCUMENTS] Erro ao adicionar documento:', error.message);
    return res.status(500).json({ error: 'Erro ao adicionar documento' });
  }
}

async function handlePatch(req, res, user) {
  const { id } = req.query;
  const { checklist_item_id, is_sensitive, review_status, review_observacao } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'ID e obrigatorio' });
  }

  if (user.role === 'estagiario') {
    return res.status(403).json({ error: 'Estagiario nao pode alterar documentos' });
  }

  try {
    const { data: doc, error } = await supabase
      .from('case_documents')
      .select('case_id, is_sensitive')
      .eq('id', id)
      .single();

    if (error || !doc) {
      return res.status(404).json({ error: 'Documento nao encontrado' });
    }

    const accessible = await canAccessCase(doc.case_id, user);
    if (!accessible) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const updates = {};
    if (checklist_item_id !== undefined) updates.checklist_item_id = checklist_item_id;
    if (is_sensitive !== undefined) updates.is_sensitive = !!is_sensitive;
    if (review_status !== undefined) updates.review_status = review_status;
    if (review_status || review_observacao) {
      updates.reviewed_by = user.id;
      updates.reviewed_at = new Date().toISOString();
    }

    const { data: updated, error: updateError } = await supabase
      .from('case_documents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log(`[CASE_DOCUMENTS] Documento atualizado: ${id}`);
    const result = { ...updated };
    delete result.storage_path;
    return res.status(200).json(result);
  } catch (error) {
    console.error('[CASE_DOCUMENTS] Erro ao atualizar documento:', error.message);
    return res.status(500).json({ error: 'Erro ao atualizar documento' });
  }
}

async function handleDelete(req, res, user) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'ID e obrigatorio' });
  }

  if (user.role === 'estagiario') {
    return res.status(403).json({ error: 'Estagiario nao pode excluir documentos' });
  }

  try {
    const { data: doc, error } = await supabase
      .from('case_documents')
      .select('case_id')
      .eq('id', id)
      .single();

    if (error || !doc) {
      return res.status(404).json({ error: 'Documento nao encontrado' });
    }

    const accessible = await canAccessCase(doc.case_id, user);
    if (!accessible) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { error: deleteError } = await supabase
      .from('case_documents')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    console.log(`[CASE_DOCUMENTS] Documento removido: ${id}`);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[CASE_DOCUMENTS] Erro ao remover documento:', error.message);
    return res.status(500).json({ error: 'Erro ao remover documento' });
  }
}
