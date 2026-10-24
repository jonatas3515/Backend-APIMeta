import { withAuth, supabaseAdmin } from '@/lib/auth';
import logger from '@/lib/logger';

async function handler(req, res) {
  const userId = req.user?.id;
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase não configurado' });

  try {
    if (req.method === 'GET') {
      const { area, tipo } = req.query || {};
      let query = supabaseAdmin
        .from('modelos_documentos')
        .select('*')
        .order('nome', { ascending: true });

      if (area) query = query.eq('area', area);
      if (tipo) query = query.eq('tipo', tipo);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ modelos: data || [] });
    }

    if (req.method === 'POST') {
      const { nome, tipo, area, descricao, link_arquivo, texto_base, ativo } = req.body || {};
      if (!nome) return res.status(400).json({ error: 'Nome do modelo é obrigatório' });

      const { data, error } = await supabaseAdmin
        .from('modelos_documentos')
        .insert({
          nome,
          tipo: tipo || 'peticao_inicial',
          area: area || 'trabalhista',
          descricao: descricao || null,
          link_arquivo: link_arquivo || null,
          texto_base: texto_base || null,
          ativo: ativo !== false,
          criado_em: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ success: true, modelo: data });
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const { id, ...updates } = req.body || {};
      if (!id) return res.status(400).json({ error: 'ID do modelo é obrigatório' });

      const { data, error } = await supabaseAdmin
        .from('modelos_documentos')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ success: true, modelo: data });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'ID do modelo é obrigatório' });

      const { error } = await supabaseAdmin
        .from('modelos_documentos')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    logger('error', 'ADMIN_MODELOS_ERROR', { userId, httpStatus: 500, error: err.message });
    return res.status(500).json({ error: 'Erro ao gerenciar modelos' });
  }
}

export default withAuth(handler, { minRole: 'admin' });
