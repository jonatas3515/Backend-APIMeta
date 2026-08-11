import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '1289520100904873';

const WHATSAPP_API_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Listar lembretes pendentes ou de uma conversa
    const { conversation_id, status } = req.query;
    
    try {
      let query = supabase.from('chat_reminders').select('*').order('scheduled_for', { ascending: true });
      
      if (conversation_id) query = query.eq('conversation_id', conversation_id);
      if (status) query = query.eq('status', status);
      
      const { data, error } = await query;
      
      if (error) throw error;
      return res.status(200).json({ success: true, reminders: data });
    } catch (error) {
      console.error('[REMINDERS] Erro ao listar:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  if (req.method === 'POST') {
    // Criar novo lembrete
    const { conversation_id, client_phone, type, title, message, scheduled_for } = req.body;
    
    if (!client_phone || !message || !scheduled_for) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }
    
    try {
      const { data, error } = await supabase
        .from('chat_reminders')
        .insert({
          conversation_id,
          client_phone,
          type: type || 'manual',
          title,
          message,
          scheduled_for,
          status: 'pending'
        })
        .select()
        .single();
      
      if (error) throw error;
      return res.status(200).json({ success: true, reminder: data });
    } catch (error) {
      console.error('[REMINDERS] Erro ao criar:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  if (req.method === 'PUT') {
    // Atualizar ou enviar lembrete
    const { id, send_now } = req.body;
    
    try {
      const { data: reminder, error: findError } = await supabase
        .from('chat_reminders')
        .select('*')
        .eq('id', id)
        .single();
      
      if (findError || !reminder) {
        return res.status(404).json({ error: 'Lembrete não encontrado' });
      }
      
      if (send_now) {
        await sendWhatsAppMessage(reminder.client_phone, reminder.message);
        
        const { error } = await supabase
          .from('chat_reminders')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', id);
        
        if (error) throw error;
        return res.status(200).json({ success: true, sent: true });
      }
      
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[REMINDERS] Erro ao atualizar:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  if (req.method === 'DELETE') {
    const { id } = req.query;
    
    try {
      const { error } = await supabase
        .from('chat_reminders')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[REMINDERS] Erro ao deletar:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}

async function sendWhatsAppMessage(to, text) {
  if (!WHATSAPP_TOKEN) {
    console.error('[WHATSAPP] Token não configurado');
    return;
  }
  
  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text }
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData?.error?.message || 'Erro ao enviar mensagem');
    }
  } catch (error) {
    console.error('[WHATSAPP] Erro ao enviar:', error);
    throw error;
  }
}
