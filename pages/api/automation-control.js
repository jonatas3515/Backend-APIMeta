import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const { conversationId, action, duration } = req.body;

  if (!conversationId || !action) {
    return res.status(400).json({ error: 'Missing conversationId or action' });
  }

  // Garante que só atualiza uma conversa específica
  if (typeof conversationId !== 'string' || conversationId.length < 10) {
    console.error('[AUTOMATION] conversationId inválido:', conversationId);
    return res.status(400).json({ error: 'conversationId inválido' });
  }

  try {
    let mode = 'bot';
    let pausedUntil = null;
    let clientStatus = null;
    let unread = null;

    if (action === 'pause') {
      mode = 'human';
      
      // Calcula quando reativar
      if (duration && duration !== 'forever') {
        const now = new Date();
        const minutes = parseInt(duration);
        pausedUntil = new Date(now.getTime() + minutes * 60000).toISOString();
      }
    } else if (action === 'resume') {
      mode = 'bot';
      pausedUntil = null;
    } else if (action === 'block_spam') {
      // Bloqueio definitivo de telemarketing: humano assume (bot silenciado),
      // status 'spam' impede a reativação automática do bot no webhook e
      // unread=false evita notificação para a equipe.
      mode = 'human';
      clientStatus = 'spam';
      unread = false;
    } else if (action === 'unblock_spam') {
      mode = 'bot';
      clientStatus = 'lead';
    }

    const updateData = { mode };
    if (clientStatus !== null) updateData.client_status = clientStatus;
    if (unread !== null) updateData.unread = unread;

    // Atualiza conversa (sem paused_until por enquanto)
    const { data, error } = await supabase
      .from('conversations')
      .update(updateData)
      .eq('id', conversationId)
      .select()
      .single();

    if (error) {
      console.error('[AUTOMATION] Erro ao atualizar:', error);
      throw error;
    }

    console.log(`[AUTOMATION] Conversa ${conversationId}: ${action} (até ${pausedUntil || 'indefinido'})`);

    return res.status(200).json({ 
      success: true, 
      mode,
      pausedUntil,
      client_status: clientStatus
    });
  } catch (error) {
    console.error('[AUTOMATION] Erro:', error);
    return res.status(500).json({ error: error.message });
  }
}
