import { anonymizeText } from './anonymize';
import { chunkText } from './chunkText';
import logger from './logger';

export const VALID_TYPES = ['tese', 'jurisprudencia', 'modelo', 'lei', 'sumula'];

export function validateDocument(payload) {
  const errors = [];

  if (!payload.title || typeof payload.title !== 'string' || payload.title.trim().length < 3) {
    errors.push('title deve ter pelo menos 3 caracteres');
  }

  if (!payload.type || !VALID_TYPES.includes(payload.type)) {
    errors.push(`type inválido. Permitidos: ${VALID_TYPES.join(', ')}`);
  }

  if (!payload.content || typeof payload.content !== 'string' || payload.content.trim().length < 10) {
    errors.push('content deve ter pelo menos 10 caracteres');
  }

  if (payload.summary && payload.summary.length > 1000) {
    errors.push('summary deve ter no máximo 1000 caracteres');
  }

  if (payload.tags && !Array.isArray(payload.tags)) {
    errors.push('tags deve ser um array');
  }

  return { valid: errors.length === 0, errors };
}

export function normalizeDocument(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    summary: row.summary,
    status: row.status,
    tags: row.tags || [],
    area: row.area,
    tribunal: row.tribunal,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    chunkCount: row.chunk_count || 0
  };
}

export function normalizeDetail(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    summary: row.summary,
    content: row.content,
    status: row.status,
    tags: row.tags || [],
    area: row.area,
    tribunal: row.tribunal,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function searchDocuments(supabase, filters = {}) {
  if (!supabase) throw new Error('Supabase não configurado');

  const { query = '', type = null, status = 'aprovado', page = 1, limit = 20 } = filters;

  let q = supabase
    .from('knowledge_documents')
    .select('id, title, type, summary, status, tags, area, tribunal, version, created_at, updated_at')
    .eq('status', status)
    .order('updated_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (type) {
    q = q.eq('type', type);
  }

  if (query && query.trim()) {
    const term = `%${query.trim().toLowerCase()}%`;
    q = q.or(`title.ilike.${term},content.ilike.${term},summary.ilike.${term}`);
  }

  const { data, error, count } = await q;
  if (error) throw error;

  return {
    documents: (data || []).map(normalizeDocument),
    total: count || data?.length || 0,
    page,
    limit
  };
}

export async function getDocument(supabase, id) {
  if (!supabase) throw new Error('Supabase não configurado');

  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return normalizeDetail(data);
}

export async function createDocument(supabase, payload, userId) {
  if (!supabase) throw new Error('Supabase não configurado');

  const validation = validateDocument(payload);
  if (!validation.valid) {
    throw new Error(validation.errors.join('; '));
  }

  const anonContent = anonymizeText(payload.content);
  const summary = payload.summary || anonContent.slice(0, 250).trim();
  const chunks = chunkText(anonContent, 1200, 120);

  const insert = {
    title: payload.title.trim(),
    type: payload.type,
    content: anonContent,
    summary,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    area: payload.area || null,
    tribunal: payload.tribunal || null,
    status: 'rascunho',
    version: 'v1.0',
    created_by: userId
  };

  const { data: doc, error: docError } = await supabase
    .from('knowledge_documents')
    .insert(insert)
    .select()
    .single();

  if (docError) throw docError;

  if (chunks.length > 0) {
    const chunkRows = chunks.map((text, idx) => ({
      document_id: doc.id,
      chunk_index: idx,
      content: text
    }));

    const { error: chunkError } = await supabase.from('knowledge_chunks').insert(chunkRows);
    if (chunkError) {
      logger('warn', 'KNOWLEDGE_CREATE_CHUNK_ERROR', { documentId: doc.id, errorCode: 'CHUNK_INSERT_FAILED' });
    }
  }

  await supabase.rpc('log_audit', {
    p_user_id: userId,
    p_entity_type: 'knowledge_document',
    p_entity_id: doc.id,
    p_action: 'create_document',
    p_old_value: null,
    p_new_value: 'rascunho',
    p_details: JSON.stringify({ title: doc.title, type: doc.type })
  });

  logger('info', 'KNOWLEDGE_CREATE_SUCCESS', { documentId: doc.id, type: doc.type });
  return normalizeDetail(doc);
}

export async function deleteDocument(supabase, id, userId) {
  if (!supabase) throw new Error('Supabase não configurado');

  const { data: existing, error: findError } = await supabase
    .from('knowledge_documents')
    .select('id, title')
    .eq('id', id)
    .single();

  if (findError || !existing) return null;

  const { error } = await supabase.from('knowledge_documents').delete().eq('id', id);
  if (error) throw error;

  await supabase.rpc('log_audit', {
    p_user_id: userId,
    p_entity_id: id,
    p_entity_type: 'knowledge_document',
    p_action: 'delete_document',
    p_old_value: existing.title,
    p_new_value: null,
    p_details: JSON.stringify({ title: existing.title })
  });

  logger('info', 'KNOWLEDGE_DELETE_SUCCESS', { documentId: id });
  return { id };
}
