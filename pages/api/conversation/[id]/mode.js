import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { id } = req.query;
    const { mode } = req.body;

    if (!id || typeof id !== 'string' || id.length < 10) {
      console.error('[MODE] id inválido:', id);
      return res.status(400).json({ error: 'ID da conversa inválido' });
    }

    if (!['bot', 'human'].includes(mode)) {
      return res.status(400).json({ error: 'Mode deve ser "bot" ou "human"' });
    }

    const { data, error } = await supabase
      .from('conversations')
      .update({ mode, updated_at: new Date() })
      .eq('id', id)
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Erro ao alterar modo:', error);
    res.status(500).json({ error: error.message });
  }
}
