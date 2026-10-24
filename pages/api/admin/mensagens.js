import { withAuth, supabaseAdmin } from '@/lib/auth';
import logger from '@/lib/logger';

async function handler(req, res) {
  const userId = req.user?.id;
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase não configurado' });

  try {
    if (req.method === 'GET') {
      const { data: msgs, error } = await supabaseAdmin
        .from('mensagens_admin')
        .select('*')
        .order('criado_em', { ascending: false });
      if (error) throw error;

      const { data: offices } = await supabaseAdmin.from('offices').select('id, name');
      const officeMap = {};
      (offices || []).forEach((o) => { officeMap[o.id] = o.name; });

      const mensagens = (msgs || []).map((m) => ({
        ...m,
        escritorio_nome: m.escritorio_id ? (officeMap[m.escritorio_id] || 'Escritório') : 'Todos os Escritórios'
      }));

      return res.status(200).json({ mensagens });
    }

    if (req.method === 'POST') {
      const { escritorio_id, assunto, mensagem } = req.body || {};
      if (!mensagem) return res.status(400).json({ error: 'Mensagem é obrigatória' });

      // Se escritorio_id for null/'todos', envia para todos os escritórios
      if (!escritorio_id || escritorio_id === 'todos') {
        const { data: offices } = await supabaseAdmin.from('offices').select('id');
        const inserts = (offices || []).map((o) => ({
          escritorio_id: o.id,
          remetente: 'admin',
          assunto: assunto || 'Comunicado Importante',
          mensagem,
          lida: false,
          criado_em: new Date().toISOString()
        }));
        if (inserts.length > 0) {
          await supabaseAdmin.from('mensagens_admin').insert(inserts);
        }
        return res.status(201).json({ success: true, count: inserts.length });
      }

      const { data, error } = await supabaseAdmin
        .from('mensagens_admin')
        .insert({
          escritorio_id,
          remetente: 'admin',
          assunto: assunto || 'Mensagem do Administrador',
          mensagem,
          lida: false,
          criado_em: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ success: true, mensagem: data });
    }

    if (req.method === 'PATCH') {
      const { id, lida } = req.body || {};
      if (!id) return res.status(400).json({ error: 'ID da mensagem é obrigatório' });

      const { data, error } = await supabaseAdmin
        .from('mensagens_admin')
        .update({ lida: lida !== false })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ success: true, mensagem: data });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'ID da mensagem é obrigatório' });

      const { error } = await supabaseAdmin
        .from('mensagens_admin')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    logger('error', 'ADMIN_MENSAGENS_ERROR', { userId, httpStatus: 500, error: err.message });
    return res.status(500).json({ error: 'Erro ao gerenciar mensagens' });
  }
}

export default withAuth(handler, { minRole: 'admin' });
