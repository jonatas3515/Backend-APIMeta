import { withAuth, supabaseAdmin } from '@/lib/auth';
import logger from '@/lib/logger';

async function handler(req, res) {
  const userId = req.user?.id;
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase não configurado' });

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('cupons_desconto')
        .select('*')
        .order('criado_em', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ cupons: data || [] });
    }

    if (req.method === 'POST') {
      const { codigo, descricao, tipo_desconto, valor_desconto, validade, uso_maximo, ativo } = req.body || {};
      if (!codigo || !valor_desconto) {
        return res.status(400).json({ error: 'Código e valor de desconto são obrigatórios' });
      }

      const { data, error } = await supabaseAdmin
        .from('cupons_desconto')
        .insert({
          codigo: String(codigo).trim().toUpperCase(),
          descricao: descricao || null,
          tipo_desconto: tipo_desconto || 'percentual',
          valor_desconto: Number(valor_desconto) || 0,
          validade: validade || null,
          uso_maximo: Number(uso_maximo) || 1,
          usos_realizados: 0,
          ativo: ativo !== false,
          criado_em: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ success: true, cupom: data });
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const { id, ...updates } = req.body || {};
      if (!id) return res.status(400).json({ error: 'ID do cupom é obrigatório' });

      if (updates.codigo) updates.codigo = String(updates.codigo).trim().toUpperCase();
      const { data, error } = await supabaseAdmin
        .from('cupons_desconto')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ success: true, cupom: data });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'ID do cupom é obrigatório' });

      const { error } = await supabaseAdmin
        .from('cupons_desconto')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    logger('error', 'ADMIN_CUPONS_ERROR', { userId, httpStatus: 500, error: err.message });
    return res.status(500).json({ error: 'Erro ao gerenciar cupons' });
  }
}

export default withAuth(handler, { minRole: 'admin' });
