import { withAuth, supabaseAdmin } from '@/lib/auth';
import logger from '@/lib/logger';

async function handler(req, res) {
  const userId = req.user?.id;
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase não configurado' });

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('planos')
        .select('*')
        .order('ordem', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ planos: data || [] });
    }

    if (req.method === 'POST') {
      const { tipo, nome, descricao, preco_mensal, preco_anual, subtitulo_landing, descricao_landing, tag_destaque, texto_botao, funcionalidades, limite_clientes, ordem, ativo } = req.body || {};
      if (!nome) return res.status(400).json({ error: 'Nome do plano é obrigatório' });

      const { data, error } = await supabaseAdmin
        .from('planos')
        .insert({
          tipo: tipo || 'basico',
          nome,
          descricao,
          preco_mensal: Number(preco_mensal) || 0,
          preco_anual: Number(preco_anual) || 0,
          subtitulo_landing,
          descricao_landing,
          tag_destaque: tag_destaque || null,
          texto_botao: texto_botao || 'Começar 30 dias grátis',
          funcionalidades: funcionalidades || [],
          limite_clientes: Number(limite_clientes) ?? -1,
          ordem: Number(ordem) || 0,
          ativo: ativo !== false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ success: true, plano: data });
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const { id, ...updates } = req.body || {};
      if (!id) return res.status(400).json({ error: 'ID do plano é obrigatório' });

      updates.updated_at = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('planos')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ success: true, plano: data });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'ID do plano é obrigatório' });

      const { error } = await supabaseAdmin
        .from('planos')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    logger('error', 'ADMIN_PLANOS_ERROR', { userId, httpStatus: 500, error: err.message });
    return res.status(500).json({ error: 'Erro ao gerenciar planos' });
  }
}

export default withAuth(handler, { minRole: 'admin' });
