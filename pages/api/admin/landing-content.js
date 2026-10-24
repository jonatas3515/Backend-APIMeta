import { withAuth, supabaseAdmin } from '@/lib/auth';
import { DEFAULT_LANDING_CONTENT } from '@/lib/legalContent';

async function handler(req, res) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('site_content')
        .select('*')
        .eq('key', 'landing_page')
        .maybeSingle();

      if (error) {
        console.error('landing_content_get_error:', error);
      }

      const merged = { ...DEFAULT_LANDING_CONTENT, ...(data?.data || {}) };
      return res.status(200).json({ success: true, content: merged });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const payload = req.body || {};
      const { data, error } = await supabaseAdmin
        .from('site_content')
        .upsert(
          {
            key: 'landing_page',
            data: payload,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'key' }
        )
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, content: data.data });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('landing_content_handler_error:', err);
    return res.status(500).json({ error: err.message || 'Erro interno ao processar conteúdo da landing' });
  }
}

export default async function route(req, res) {
  if (req.method === 'GET') {
    return handler(req, res);
  }
  return withAuth(handler, { minRole: 'admin' })(req, res);
}
