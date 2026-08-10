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

  try {
    let mode = 'bot';
    let pausedUntil = null;

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
    }

    // Atualiza conversa
    const { data, error } = await supabase
      .from('conversations')
      .update({ 
        mode,
        paused_until: pausedUntil
      })
      .eq('id', conversationId)
      .select()
      .single();

    if (error) throw error;

    console.log(`[AUTOMATION] Conversa ${conversationId}: ${action} (até ${pausedUntil || 'indefinido'})`);

    return res.status(200).json({ 
      success: true, 
      mode,
      pausedUntil 
    });
  } catch (error) {
    console.error('[AUTOMATION] Erro:', error);
    return res.status(500).json({ error: error.message });
  }
}
