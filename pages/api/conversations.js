import { withAuth, supabaseAdmin } from '@/lib/auth';

async function handler(req, res) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase nao configurado' });
  }

  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Metodo nao permitido' });
    }

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('id, client_name, client_phone, client_status, legal_area, updated_at')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json(data || []);
  } catch (error) {
    console.error('[CONVERSATIONS] Erro:', error.message);
    return res.status(500).json({ error: 'Erro ao buscar conversas' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
