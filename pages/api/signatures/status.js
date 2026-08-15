import { supabase } from '../../../lib/supabaseClient';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const headers = req.headers;
    const token = headers.authorization?.split(' ')[1];
    const { case_id, signature_id } = req.query;

    if (!token) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    // Verifica autenticação
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    let query = supabase.from('document_signatures').select('*');

    if (signature_id) {
      if (!UUID_REGEX.test(signature_id)) {
        return res.status(400).json({ error: 'signature_id inválido' });
      }
      query = query.eq('id', signature_id);
    } else if (case_id) {
      if (!UUID_REGEX.test(case_id) && case_id !== 'undefined') {
        return res.status(400).json({ error: 'case_id inválido' });
      }
      query = query.eq('case_id', case_id);
    } else {
      return res.status(400).json({ error: 'case_id ou signature_id obrigatório' });
    }

    const { data, error } = await query;

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Nenhuma assinatura encontrada' });
    }

    // Formata resposta
    const signatures = data.map(sig => ({
      id: sig.id,
      case_id: sig.case_id,
      document_name: sig.document_name,
      document_type: sig.document_type,
      status: sig.status,
      platform: sig.platform,
      signers: sig.signers,
      sent_at: sig.sent_at,
      completed_at: sig.completed_at,
      created_at: sig.created_at,
      updated_at: sig.updated_at
    }));

    return res.status(200).json({
      signatures: signature_id ? signatures[0] : signatures,
      message: 'Status carregado com sucesso'
    });
  } catch (error) {
    console.error('[SIGNATURES-STATUS] Erro:', error);
    return res.status(500).json({ error: 'Erro ao buscar status' });
  }
}
