import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { normalizeConsent } from '@/lib/consents';
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

  if (req.method === 'DELETE' || (req.method === 'POST' && req.query.action === 'revoke')) {
    return handleRevoke(req, res);
  }

  logger('warn', 'CONSENT_DETAIL_INVALID_METHOD', { httpStatus: 405, userId: req.user?.id });
  return res.status(405).json({ error: 'Método não permitido' });
}

async function handleGet(req, res) {
  const { id } = req.query;
  const user = req.user;

  try {
    const { data: consent, error } = await supabase
      .from('consent_logs')
      .select('id, conversation_id, consent_type, legal_basis, channel, term_version, value, notes, created_at, revoked_at')
      .eq('id', id)
      .single();

    if (error || !consent) {
      logger('warn', 'CONSENT_DETAIL_NOT_FOUND', { httpStatus: 404, userId: user.id });
      return res.status(404).json({ error: 'Consentimento não encontrado' });
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, assigned_user_id')
      .eq('id', consent.conversation_id)
      .single();

    if (convError || !conversation) {
      logger('warn', 'CONSENT_DETAIL_NOT_FOUND', { httpStatus: 404, userId: user.id });
      return res.status(404).json({ error: 'Titular não encontrado' });
    }

    const isAdmin = user.role === 'admin';
    const isLawyer = user.role === 'advogado';
    const isOwner = conversation.assigned_user_id === user.id;

    if (!isAdmin && !isLawyer && !isOwner) {
      logger('warn', 'CONSENT_DETAIL_FORBIDDEN', { httpStatus: 403, userId: user.id });
      return res.status(403).json({ error: 'Acesso negado' });
    }

    logger('info', 'CONSENT_DETAIL_SUCCESS', { httpStatus: 200, userId: user.id });
    return res.status(200).json(normalizeConsent(consent));
  } catch (error) {
    logger('error', 'CONSENT_DETAIL_ERROR', { httpStatus: 500, userId: user.id, errorCode: 'CONSENT_DETAIL_FAILED' });
    return res.status(500).json({ error: 'Erro ao buscar consentimento' });
  }
}

async function handleRevoke(req, res) {
  const { id } = req.query;
  const user = req.user;

  try {
    const { data: consent, error: findError } = await supabase
      .from('consent_logs')
      .select('id, conversation_id, consent_type, revoked_at')
      .eq('id', id)
      .single();

    if (findError || !consent) {
      logger('warn', 'CONSENT_REVOKE_NOT_FOUND', { httpStatus: 404, userId: user.id });
      return res.status(404).json({ error: 'Consentimento não encontrado' });
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, assigned_user_id')
      .eq('id', consent.conversation_id)
      .single();

    if (convError || !conversation) {
      logger('warn', 'CONSENT_REVOKE_NOT_FOUND', { httpStatus: 404, userId: user.id });
      return res.status(404).json({ error: 'Titular não encontrado' });
    }

    const isAdmin = user.role === 'admin';
    const isLawyer = user.role === 'advogado';
    const isOwner = conversation.assigned_user_id === user.id;

    if (!isAdmin && !isLawyer && !isOwner) {
      logger('warn', 'CONSENT_REVOKE_FORBIDDEN', { httpStatus: 403, userId: user.id });
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (consent.revoked_at) {
      logger('warn', 'CONSENT_REVOKE_ALREADY_REVOKED', { httpStatus: 409, userId: user.id });
      return res.status(409).json({ error: 'Consentimento já revogado' });
    }

    const revokedAt = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from('consent_logs')
      .update({ revoked_at: revokedAt })
      .eq('id', id)
      .select('id, conversation_id, consent_type, legal_basis, channel, term_version, value, notes, created_at, revoked_at')
      .single();

    if (updateError) throw updateError;

    await supabase.rpc('log_audit', {
      p_user_id: user.id,
      p_entity_type: 'consent',
      p_entity_id: id,
      p_action: 'revoke_consent',
      p_old_value: 'active',
      p_new_value: 'revoked',
      p_details: JSON.stringify({ clientId: consent.conversation_id, purpose: consent.consent_type, revokedAt })
    });

    logger('info', 'CONSENT_REVOKE_SUCCESS', { httpStatus: 200, userId: user.id });
    return res.status(200).json(normalizeConsent(updated));
  } catch (error) {
    logger('error', 'CONSENT_REVOKE_ERROR', { httpStatus: 500, userId: user.id, errorCode: 'CONSENT_REVOKE_FAILED' });
    return res.status(500).json({ error: 'Erro ao revogar consentimento' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
