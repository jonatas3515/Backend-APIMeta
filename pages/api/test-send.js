import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export default async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  try {
    // Buscar primeira conversa
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id, client_phone')
      .limit(1);

    if (convError || !conversations?.length) {
      return res.status(400).json({ 
        error: 'Nenhuma conversa encontrada',
        details: convError?.message 
      });
    }

    const conversation = conversations[0];

    return res.status(200).json({
      success: true,
      conversation: {
        id: conversation.id,
        client_phone: conversation.client_phone
      },
      message: 'Conversa encontrada com sucesso. Agora execute a migration 032 no Supabase SQL Editor.'
    });
  } catch (error) {
    console.error('[TEST-SEND] Erro:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
}
