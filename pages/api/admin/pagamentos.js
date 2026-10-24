import { withAuth, supabaseAdmin } from '@/lib/auth';
import logger from '@/lib/logger';

async function handler(req, res) {
  const userId = req.user?.id;
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase não configurado' });

  try {
    if (req.method === 'GET') {
      const { status } = req.query || {};
      let query = supabaseAdmin
        .from('pagamentos')
        .select('*')
        .order('criado_em', { ascending: false });

      if (status && status !== 'todos') {
        query = query.eq('status', status);
      }

      const { data: pags, error } = await query;
      if (error) throw error;

      const { data: offices } = await supabaseAdmin.from('offices').select('id, name');
      const officeMap = {};
      (offices || []).forEach((o) => { officeMap[o.id] = o.name; });

      const pagamentos = (pags || []).map((p) => ({
        ...p,
        escritorio_nome: officeMap[p.escritorio_id] || 'Escritório'
      }));

      return res.status(200).json({ pagamentos });
    }

    if (req.method === 'POST') {
      const { escritorio_id, valor, metodo, status, meses, observacoes } = req.body || {};
      if (!escritorio_id || !valor) {
        return res.status(400).json({ error: 'Escritório e valor são obrigatórios' });
      }

      const mesesNum = Number(meses) || 1;
      const fim = new Date(Date.now() + mesesNum * 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabaseAdmin
        .from('pagamentos')
        .insert({
          escritorio_id,
          valor: Number(valor) * mesesNum,
          metodo: metodo || 'pix',
          status: status || 'aprovado',
          periodo_inicio: new Date().toISOString(),
          periodo_fim: fim,
          criado_em: new Date().toISOString(),
          aprovado_em: new Date().toISOString(),
          observacoes: observacoes || `Pagamento manual registrado pelo Admin (${mesesNum} mês/meses)`
        })
        .select()
        .single();
      if (error) throw error;

      // Se pagamento aprovado, atualiza o status do escritório para active
      if (status !== 'recusado' && status !== 'cancelado') {
        await supabaseAdmin.from('offices').update({
          status: 'active',
          updated_at: new Date().toISOString()
        }).eq('id', escritorio_id);
      }

      return res.status(201).json({ success: true, pagamento: data });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    logger('error', 'ADMIN_PAGAMENTOS_ERROR', { userId, httpStatus: 500, error: err.message });
    return res.status(500).json({ error: 'Erro ao gerenciar pagamentos' });
  }
}

export default withAuth(handler, { minRole: 'admin' });
