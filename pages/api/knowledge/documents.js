import { supabaseServer } from '../../../lib/supabaseServer';
import { anonymizeText } from '../../../lib/anonymize';
import { chunkText } from '../../../lib/chunkText';
import { withAuth, getTenantOfficeId } from '../../../lib/auth';
import { canAccessFeature } from '../../../lib/plans';

async function handler(req, res) {
  if (!supabaseServer) {
    return res.status(500).json({ error: 'Servidor Supabase não configurado' });
  }

  const profile = req.user;
  const office = profile?.office;
  const isMasterOrMatriz = profile?.is_master || office?.id === '00000000-0000-0000-0000-000000000001';
  const hasAccess = isMasterOrMatriz || canAccessFeature(office?.plan, 'rag_custom', office);

  if (!hasAccess) {
    return res.status(403).json({
      error: 'A Base de Conhecimento e RAG Jurídico é exclusiva do Plano Enterprise.',
      upgradeRequired: true,
      requiredPlan: 'Enterprise'
    });
  }

  const officeId = getTenantOfficeId(req);

  // POST: Cadastrar novo documento
  if (req.method === 'POST') {
    if (!['admin', 'advogado'].includes(profile.role)) {
      return res.status(403).json({ error: 'Permissão negada para cadastrar documentos' });
    }

    const { title, type, area, tribunal, tags, content, version = 'v1.0' } = req.body || {};
    if (!title || !type || !content) {
      return res.status(400).json({ error: 'Campos obrigatórios: title, type, content' });
    }

    const allowedTypes = ['modelo_peca', 'clausula', 'tese', 'checklist', 'jurisprudencia'];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido' });
    }

    const anonContent = anonymizeText(content);
    const chunks = chunkText(anonContent, 1200, 120);

    const { data: doc, error: docError } = await supabaseServer
      .from('knowledge_documents')
      .insert({
        title: title.trim(),
        type,
        area: area || null,
        tribunal: tribunal || null,
        tags: Array.isArray(tags) ? tags : [],
        status: 'rascunho',
        version,
        content: anonContent,
        created_by: profile.id,
        office_id: officeId
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

  // GET: Listar ou buscar documento por ID
  if (req.method === 'GET') {
    const { id, status = 'aprovado', type, area, tribunal } = req.query;

    if (id) {
      let docQuery = supabaseServer
        .from('knowledge_documents')
        .select('*')
        .eq('id', id);

      // Usuário comum só vê documentos do próprio escritório
      if (!isMasterOrMatriz) {
        docQuery = docQuery.eq('office_id', officeId);
      }

      const { data: doc, error } = await docQuery.single();

      if (error || !doc) {
        return res.status(404).json({ error: 'Documento não encontrado' });
      }

      const { count, error: countError } = await supabaseServer
        .from('knowledge_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', id);

      if (countError) {
        console.error('[KNOWLEDGE] Erro ao contar chunks:', countError);
      }

      return res.status(200).json({ document: { ...doc, chunk_count: count || 0 } });
    }

    let q = supabaseServer
      .from('knowledge_documents')
      .select('id, title, type, area, tribunal, tags, status, version, created_at, updated_at, content, office_id')
      .order('updated_at', { ascending: false });

    if (!isMasterOrMatriz) {
      q = q.eq('office_id', officeId);
    } else if (req.query.office_id) {
      q = q.eq('office_id', req.query.office_id);
    }

    if (status !== 'all') q = q.eq('status', status);
    if (type) q = q.eq('type', type);
    if (area) q = q.eq('area', area);
    if (tribunal) q = q.eq('tribunal', tribunal);

    const { data, error } = await q;

    if (error) {
      console.error('[KNOWLEDGE] Erro ao listar documentos:', error);
      return res.status(500).json({ error: 'Erro ao listar documentos' });
    }

    const docIds = (data || []).map(d => d.id);
    const chunkCounts = {};

    if (docIds.length > 0) {
      const { data: chunks, error: chunksError } = await supabaseServer
        .from('knowledge_chunks')
        .select('document_id')
        .in('document_id', docIds);

      if (chunksError) {
        console.error('[KNOWLEDGE] Erro ao carregar chunks:', chunksError);
      } else {
        for (const c of chunks || []) {
          chunkCounts[c.document_id] = (chunkCounts[c.document_id] || 0) + 1;
        }
      }
    }

    const documents = (data || []).map(d => ({
      ...d,
      preview: d.content ? `${d.content.slice(0, 300)}${d.content.length > 300 ? '...' : ''}` : '',
      content: undefined,
      chunk_count: chunkCounts[d.id] || 0
    }));

    return res.status(200).json({ documents });
  }

  // PATCH: Alterar status do documento (rascunho / revisado / aprovado)
  if (req.method === 'PATCH') {
    if (!['admin', 'advogado'].includes(profile.role)) {
      return res.status(403).json({ error: 'Permissão negada' });
    }
    const { id, status: newStatus } = req.body || {};
    if (!id || !newStatus) {
      return res.status(400).json({ error: 'id e status obrigatórios' });
    }

    let existingQuery = supabaseServer
      .from('knowledge_documents')
      .select('content, office_id')
      .eq('id', id);

    if (!isMasterOrMatriz) {
      existingQuery = existingQuery.eq('office_id', officeId);
    }

    const { data: existing, error: existingError } = await existingQuery.single();

    if (existingError || !existing) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    if (newStatus === 'aprovado') {
      const anonContent = anonymizeText(existing.content);
      const chunks = chunkText(anonContent, 1200, 120);

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

      const { error } = await supabaseServer
        .from('knowledge_documents')
        .update({
          status: 'aprovado',
          content: anonContent,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) {
        return res.status(500).json({ error: 'Erro ao aprovar documento' });
      }

      return res.status(200).json({ ok: true, chunks: chunks.length });
    }

    const { error } = await supabaseServer
      .from('knowledge_documents')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: 'Erro ao atualizar status' });
    }

    return res.status(200).json({ ok: true });
  }

  // PUT: Editar documento
  if (req.method === 'PUT') {
    if (!['admin', 'advogado'].includes(profile.role)) {
      return res.status(403).json({ error: 'Permissão negada' });
    }

    const { id, title, type, area, tribunal, tags, content, version } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'id obrigatório' });
    }

    let existingQuery = supabaseServer
      .from('knowledge_documents')
      .select('id, office_id')
      .eq('id', id);

    if (!isMasterOrMatriz) {
      existingQuery = existingQuery.eq('office_id', officeId);
    }

    const existing = await existingQuery.single();
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

export default withAuth(handler, { minRole: 'estagiario' });
