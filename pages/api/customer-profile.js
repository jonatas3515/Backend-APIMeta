import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const { method } = req;

  try {
    if (method === 'POST') {
      return handlePost(req, res);
    }

    if (method !== 'GET') {
      return res.status(405).json({ error: 'Método não permitido' });
    }

    const { conversation_id } = req.query;

    if (!conversation_id) {
      return res.status(400).json({ error: 'conversation_id é obrigatório' });
    }
    // Dados da conversa/cliente
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversation_id)
      .single();

    if (convError) {
      console.error('[CUSTOMER-PROFILE] Erro na consulta de conversa:', convError);
      return res.status(500).json({ error: convError.message || 'Erro na consulta de conversa' });
    }

    if (!conversation) {
      console.error('[CUSTOMER-PROFILE] Conversa não encontrada:', conversation_id);
      return res.status(404).json({ error: 'Conversa não encontrada', conversation_id });
    }

    // Verifica anonimização
    const { data: anonymized, error: anomError } = await supabase
      .from('anonymized_data')
      .select('id, anonymized_at')
      .eq('original_entity_type', 'conversation')
      .eq('original_entity_id', conversation_id)
      .maybeSingle();

    if (anomError) {
      console.error('[CUSTOMER-PROFILE] Erro ao verificar anonimização:', anomError);
    }

    if (anonymized?.id) {
      return res.status(200).json({
        anonymized: true,
        customer: {
          id: conversation.id,
          name: 'Cliente Anonimizado',
          phone: conversation.client_phone ? `****${conversation.client_phone.slice(-4)}` : null,
          email: null,
          municipality: null,
          state: null,
          first_contact_at: conversation.created_at,
          status: 'anonymized'
        },
        active_cases: [],
        closed_cases: [],
        documents: [],
        consents: [],
        recent_messages: []
      });
    }

    // Casos ativos e encerrados
    const { data: cases, error: casesError } = await supabase
      .from('cases')
      .select('id, title, legal_area, case_type, status, priority, deadline_date, created_at, updated_at')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false });

    if (casesError) {
      console.error('[CUSTOMER-PROFILE] Erro ao buscar casos:', casesError);
      throw casesError;
    }

    const active_cases = (cases || [])
      .filter(c => c.status !== 'encerrado')
      .slice(0, 10);

    const closed_cases = (cases || [])
      .filter(c => c.status === 'encerrado')
      .slice(0, 5);

    // Documentos dos casos
    const caseIds = (cases || []).map(c => c.id);
    let documents = [];

    if (caseIds.length > 0) {
      const { data: docs, error: docsError } = await supabase
        .from('case_document_checklists')
        .select('id, case_id, document_name, status, received_at, media_url, media_type, created_at')
        .in('case_id', caseIds)
        .in('status', ['received', 'verified'])
        .order('received_at', { ascending: false })
        .limit(10);

      if (docsError) {
        console.error('[CUSTOMER-PROFILE] Erro ao buscar documentos:', docsError);
      } else {
        documents = docs || [];
      }
    }

    // Consentimentos LGPD
    const { data: consents, error: consentsError } = await supabase
      .from('consent_logs')
      .select('id, consent_type, value, created_at')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (consentsError) {
      console.error('[CUSTOMER-PROFILE] Erro ao buscar consentimentos:', consentsError);
    }

    // Últimas mensagens (não sensíveis)
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('id, direction, sender_type, content_type, text, created_at')
      .eq('conversation_id', conversation_id)
      .eq('is_sensitive', false)
      .order('created_at', { ascending: false })
      .limit(5);

    if (msgError) {
      console.error('[CUSTOMER-PROFILE] Erro ao buscar mensagens:', msgError);
    }

    const recent_messages = (messages || [])
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Preferências de comunicação (do intake_data se existir)
    const intake_data = conversation.intake_data || {};
    const preferences = {
      preferred_channel: intake_data.preferred_channel || 'WhatsApp',
      best_time: intake_data.best_time || null,
      language: intake_data.language || 'Português'
    };

    const customer = {
      id: conversation.id,
      name: conversation.client_name,
      phone: conversation.client_phone,
      email: conversation.client_email || null,
      municipality: conversation.municipality,
      state: conversation.state,
      legal_area: conversation.legal_area,
      case_summary: conversation.case_summary,
      first_contact_at: conversation.first_contact_at || conversation.created_at,
      lead_created_at: conversation.lead_created_at,
      is_client: conversation.is_client,
      client_status: conversation.client_status,
      funnel_stage: conversation.funnel_stage,
      status: conversation.status,
      preferences,
      intake_data: conversation.intake_data || {}
    };

    return res.status(200).json({
      anonymized: false,
      customer,
      active_cases,
      closed_cases,
      documents,
      consents: consents || [],
      recent_messages
    });
  } catch (error) {
    console.error('[CUSTOMER-PROFILE] Erro:', error);
    return res.status(500).json({ error: 'Erro ao carregar perfil do cliente' });
  }
}

async function handlePost(req, res) {
  const { action, conversation_id } = req.body;

  if (action !== 'request_consent' || !conversation_id) {
    return res.status(400).json({ error: 'Ação ou conversation_id inválidos' });
  }

  try {
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, client_phone, client_name, intake_data')
      .eq('id', conversation_id)
      .single();

    if (convError || !conversation) {
      console.error('[CUSTOMER-PROFILE] Erro ao buscar conversa:', convError);
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    if (!conversation.client_phone) {
      return res.status(400).json({ error: 'Conversa sem telefone do cliente' });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://chatnevesecosta.vercel.app';
    const policyUrl = `${baseUrl}/politica-de-privacidade`;
    const message = `Neves & Costa - LGPD\n\nPara prosseguir com o atendimento e armazenar seus dados com segurança, precisamos do seu consentimento conforme a LGPD.\n\nLeia nossa política de privacidade: ${policyUrl}\n\nSe concorda com o tratamento dos seus dados pessoais, responda apenas: *1* (ou diga ACEITO/CONCORDO).\n\nSe não concorda, responda: *2* (ou diga NÃO ACEITO/RECUSO).`;

    const waMessageId = await sendWhatsAppMessage(conversation.client_phone, message);

    const now = new Date().toISOString();
    const updatedIntake = {
      ...(conversation.intake_data || {}),
      consent_request_sent_at: now,
      consent_request_status: 'pending'
    };

    const { error: updateError } = await supabase
      .from('conversations')
      .update({ intake_data: updatedIntake })
      .eq('id', conversation_id);

    if (updateError) {
      console.error('[CUSTOMER-PROFILE] Erro ao atualizar intake_data:', updateError);
      throw updateError;
    }

    // Salva a mensagem enviada como outbound/ai
    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        direction: 'outbound',
        sender_type: 'ai',
        text: message,
        content_type: 'text',
        status: 'sent',
        wa_message_id: waMessageId
      });

    if (insertError) {
      console.error('[CUSTOMER-PROFILE] ❌ Erro ao salvar mensagem no banco:', insertError);
      throw insertError;
    }

    return res.status(200).json({ success: true, message: 'Solicitação de consentimento enviada' });
  } catch (error) {
    console.error('[CUSTOMER-PROFILE] Erro ao solicitar consentimento:', error);
    return res.status(500).json({ error: error.message || 'Erro ao solicitar consentimento' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
