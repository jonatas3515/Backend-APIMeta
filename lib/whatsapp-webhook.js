import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

const VALID_MODES = ['subscribe', 'deny', 'unsubscribe'];

export function extractWhatsAppMessage(body) {
  if (!body || typeof body !== 'object') return null;

  const entry = body?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  if (!value) return null;

  const messages = value.messages || [];
  const message = messages[0];

  if (!message) return null;

  const from = message.from;
  const type = message.type;
  const timestamp = message.timestamp;
  const waMessageId = message.id;

  let content = null;
  if (type === 'text' && message.text) {
    content = message.text.body;
  }

  return {
    from,
    type,
    content,
    timestamp,
    waMessageId,
    phoneNumberId: value.metadata?.phone_number_id
  };
}

export function generateVerifyToken(query) {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = query;

  if (!VALID_MODES.includes(mode) || token !== process.env.WEBHOOK_VERIFY_TOKEN) {
    return null;
  }

  return challenge;
}

export async function findOrCreateConversationByPhone(phone) {
  if (!supabase) return null;

  const { data: existing, error: findError } = await supabase
    .from('conversations')
    .select('id, client_phone, assigned_user_id')
    .eq('client_phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) return existing;

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({
      client_phone: phone,
      client_name: null,
      status: 'open',
      is_client: false
    })
    .select('id, client_phone, assigned_user_id')
    .single();

  if (createError) throw createError;
  return created;
}

export async function saveInboundMessage(conversation, inbound) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      direction: 'inbound',
      sender_type: 'client',
      content_type: inbound.type || 'text',
      text: inbound.content,
      wa_message_id: inbound.waMessageId,
      status: 'received'
    })
    .select('id')
    .single();

  if (error) throw error;
  return data;
}
