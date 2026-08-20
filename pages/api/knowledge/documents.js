import { supabaseServer } from '../../../lib/supabaseServer';
import { anonymizeText } from '../../../lib/anonymize';
import { chunkText } from '../../../lib/chunkText';

async function getUserFromToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return null;
  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function canIngest(userId) {
  const { data } = await supabaseServer
    .from('users')
    .select('role')
    .eq('auth_user_id', userId)
    .single();
  return data && ['admin', 'advogado'].includes(data.role);
}

export default async function handler(req, res) {
  if (!supabaseServer) {
    return res.status(500).json({ error: 'Servidor Supabase não configurado' });
  }

  const user = await getUserFromToken(req);
  if (!user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  if (req.method === 'POST') {
    const allowed = await canIngest(user.id);
    if (!allowed) {
      return res.status(403).json({ error: 'Permissão negada' });
    }

    const { title, type, area, tribunal, tags, content, version = 'v1.0' } = req.body || {};
    if (!title || !type || !content) {
      return res.status(400).json({ error: 'Campos obrigatórios: title, type, content' });
    }

    const allowedTypes = ['modelo_peca','clausula','tese','checklist','jurisprudencia'];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido' });
    }

    const anonContent = anonymizeText(content);
    const chunks = chunkText(anonContent, 1200, 120);

    const { data: doc, error: docError } = await supabaseServer
      .from('knowledge_documents')
      .insert({
        title,
        type,
        area: area || null,
        tribunal: tribunal || null,
        tags: Array.isArray(tags) ? tags : [],
        status: 'rascunho',
        version,
        content: anonContent,
        created_by: user.id
      })
      .select()
      .single();

    if (docError) {
      console.error('[KNOWLEDGE] Erro ao inserir documento:', docError);
      return res.status(500).json({ error: 'Erro ao salvar documento' });
    }

    if (chunks.length > 0) {
      const chunkRows = chunks.map((text, idx) => ({
        document_id: doc.id,
        chunk_index: idx,
        content: text
      }));

      const { error: chunkError } = await supabaseServer
        .from('knowledge_chunks')
        .insert(chunkRows);

      if (chunkError) {
        console.error('[KNOWLEDGE] Erro ao inserir chunks:', chunkError);
      }
    }

    return res.status(200).json({ document: doc, chunks: chunks.length });
  }

  if (req.method === 'GET') {
    const { status = 'aprovado', type, area, tribunal } = req.query;

    let q = supabaseServer
      .from('knowledge_documents')
      .select('id, title, type, area, tribunal, tags, status, version, created_at, updated_at, content')
      .order('updated_at', { ascending: false });

    if (status !== 'all') q = q.eq('status', status);
    if (type) q = q.eq('type', type);
    if (area) q = q.eq('area', area);
    if (tribunal) q = q.eq('tribunal', tribunal);

    const { data, error } = await q;

    if (error) {
      console.error('[KNOWLEDGE] Erro ao listar documentos:', error);
      return res.status(500).json({ error: 'Erro ao listar documentos' });
    }

    const documents = (data || []).map(d => ({
      ...d,
      preview: d.content ? `${d.content.slice(0, 300)}${d.content.length > 300 ? '...' : ''}` : '',
      content: undefined
    }));

    return res.status(200).json({ documents });
  }

  if (req.method === 'PATCH') {
    const allowed = await canIngest(user.id);
    if (!allowed) {
      return res.status(403).json({ error: 'Permissão negada' });
    }
    const { id, status: newStatus } = req.body || {};
    if (!id || !newStatus) {
      return res.status(400).json({ error: 'id e status obrigatórios' });
    }

    const { error } = await supabaseServer
      .from('knowledge_documents')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: 'Erro ao atualizar status' });
    }

    return res.status(200).json({ ok: true });
  }

  if (req.method === 'PUT') {
    const allowed = await canIngest(user.id);
    if (!allowed) {
      return res.status(403).json({ error: 'Permissão negada' });
    }

    const { id, title, type, area, tribunal, tags, content, version } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'id obrigatório' });
    }

    const existing = await supabaseServer
      .from('knowledge_documents')
      .select('id')
      .eq('id', id)
      .single();
    if (!existing.data) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (type !== undefined) updates.type = type;
    if (area !== undefined) updates.area = area || null;
    if (tribunal !== undefined) updates.tribunal = tribunal || null;
    if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : [];
    if (version !== undefined) updates.version = version;

    let chunks = null;
    if (content !== undefined) {
      const anonContent = anonymizeText(content);
      chunks = chunkText(anonContent, 1200, 120);
      updates.content = anonContent;

      await supabaseServer.from('knowledge_chunks').delete().eq('document_id', id);

      if (chunks.length > 0) {
        const chunkRows = chunks.map((text, idx) => ({
          document_id: id,
          chunk_index: idx,
          content: text
        }));

        const { error: chunkError } = await supabaseServer
          .from('knowledge_chunks')
          .insert(chunkRows);

        if (chunkError) {
          console.error('[KNOWLEDGE] Erro ao inserir chunks:', chunkError);
          return res.status(500).json({ error: 'Erro ao reindexar chunks' });
        }
      }
    }

    updates.updated_at = new Date().toISOString();

    const { data: doc, error } = await supabaseServer
      .from('knowledge_documents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[KNOWLEDGE] Erro ao atualizar documento:', error);
      return res.status(500).json({ error: 'Erro ao atualizar documento' });
    }

    return res.status(200).json({ document: doc, chunks: chunks ? chunks.length : 0 });
  }

  res.setHeader('Allow', 'GET, POST, PATCH, PUT');
  return res.status(405).json({ error: 'Método não permitido' });
}
