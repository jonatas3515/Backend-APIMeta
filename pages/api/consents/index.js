import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { validateConsent, normalizeConsent } from '@/lib/consents';
import logger from '@/lib/logger';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Serviço indisponível' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  logger('warn', 'CONSENT_INVALID_METHOD', { httpStatus: 405, userId: req.user?.id });
  return res.status(405).json({ error: 'Método não permitido' });
}

async function handleGet(req, res) {
  const { clientId } = req.query;
  const user = req.user;

  if (!clientId) {
    logger('warn', 'CONSENT_GET_VALIDATION', { httpStatus: 400, userId: user.id, errorCode: 'CLIENT_ID_MISSING' });
    return res.status(400).json({ error: 'clientId é obrigatório' });
  }

  try {
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, client_phone, assigned_user_id')
      .eq('id', clientId)
      .single();

    if (convError || !conversation) {
      logger('warn', 'CONSENT_GET_NOT_FOUND', { httpStatus: 404, userId: user.id, conversationId: clientId });
      return res.status(404).json({ error: 'Titular não encontrado' });
    }

    const isAdmin = user.role === 'admin';
    const isLawyer = user.role === 'advogado';
    const isOwner = conversation.assigned_user_id === user.id;

    if (!isAdmin && !isLawyer && !isOwner) {
      logger('warn', 'CONSENT_GET_FORBIDDEN', { httpStatus: 403, userId: user.id, conversationId: clientId });
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { data, error } = await supabase
      .from('consent_logs')
      .select('id, conversation_id, consent_type, legal_basis, channel, term_version, value, notes, created_at, revoked_at')
      .eq('conversation_id', clientId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const result = (data || []).map(normalizeConsent);

    logger('info', 'CONSENT_GET_SUCCESS', { httpStatus: 200, userId: user.id, conversationId: clientId, count: result.length });
    return res.status(200).json(result);
  } catch (error) {
    logger('error', 'CONSENT_GET_ERROR', { httpStatus: 500, userId: user.id, conversationId: clientId, errorCode: 'CONSENT_GET_FAILED' });
    return res.status(500).json({ error: 'Erro ao buscar consentimentos' });
  }
}

async function handlePost(req, res) {
  const user = req.user;
  const { clientId, purpose, legalBasis, channel, version, notes, value = true } = req.body;

  const validation = validateConsent({ clientId, purpose, legalBasis, channel, version });
  if (!validation.valid) {
    logger('warn', 'CONSENT_CREATE_VALIDATION', { httpStatus: 400, userId: user.id, errorCode: 'INVALID_FIELDS' });
    return res.status(400).json({ error: validation.errors.join('; ') });
  }

  try {
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, client_phone, assigned_user_id')
      .eq('id', clientId)
      .single();

    if (convError || !conversation) {
      logger('warn', 'CONSENT_CREATE_NOT_FOUND', { httpStatus: 404, userId: user.id, conversationId: clientId });
      return res.status(404).json({ error: 'Titular não encontrado' });
    }

    const isAdmin = user.role === 'admin';
    const isLawyer = user.role === 'advogado';
    const isOwner = conversation.assigned_user_id === user.id;

    if (!isAdmin && !isLawyer && !isOwner) {
      logger('warn', 'CONSENT_CREATE_FORBIDDEN', { httpStatus: 403, userId: user.id, conversationId: clientId });
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { data: existing, error: dupError } = await supabase
      .from('consent_logs')
      .select('id')
      .eq('conversation_id', clientId)
      .eq('consent_type', purpose)
      .eq('term_version', version)
      .is('revoked_at', null)
      .limit(1);

    if (dupError) throw dupError;

    if (existing && existing.length > 0) {
      logger('warn', 'CONSENT_CREATE_DUPLICATE', { httpStatus: 409, userId: user.id, conversationId: clientId });
      return res.status(409).json({ error: 'Consentimento idêntico já existe e não está revogado' });
    }

    const insert = {
      conversation_id: clientId,
      consent_type: purpose,
      legal_basis: legalBasis,
      channel,
      term_version: version,
      value: !!value,
      notes: notes || null,
      created_at: new Date().toISOString()
    };

    const { data: created, error: insertError } = await supabase
      .from('consent_logs')
      .insert(insert)
      .select('id, conversation_id, consent_type, legal_basis, channel, term_version, value, notes, created_at, revoked_at')
      .single();

    if (insertError) throw insertError;

    await supabase.rpc('log_audit', {
      p_user_id: user.id,
      p_entity_type: 'consent',
      p_entity_id: created.id,
      p_action: 'create_consent',
      p_old_value: null,
      p_new_value: 'active',
      p_details: JSON.stringify({ clientId, purpose, legalBasis, channel, version })
    });

    logger('info', 'CONSENT_CREATE_SUCCESS', { httpStatus: 201, userId: user.id, conversationId: clientId });
    return res.status(201).json(normalizeConsent(created));
  } catch (error) {
    logger('error', 'CONSENT_CREATE_ERROR', { httpStatus: 500, userId: user.id, conversationId: clientId, errorCode: 'CONSENT_CREATE_FAILED' });
    return res.status(500).json({ error: 'Erro ao registrar consentimento' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
