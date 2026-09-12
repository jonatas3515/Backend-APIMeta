import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { buildExport } from '@/lib/lgpd-export';
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

  if (req.method !== 'GET') {
    logger('warn', 'LGPD_EXPORT_INVALID_METHOD', { httpStatus: 405, userId: req.user?.id });
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { clientId, format = 'json' } = req.query;

  if (!clientId) {
    logger('warn', 'LGPD_EXPORT_VALIDATION', { httpStatus: 400, userId: req.user?.id, errorCode: 'CLIENT_ID_MISSING' });
    return res.status(400).json({ error: 'Identificador do titular é obrigatório' });
  }

  if (!['json', 'csv'].includes(format)) {
    logger('warn', 'LGPD_EXPORT_VALIDATION', { httpStatus: 400, userId: req.user?.id, errorCode: 'INVALID_FORMAT' });
    return res.status(400).json({ error: 'Formato inválido. Use json ou csv' });
  }

  try {
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, client_phone, assigned_user_id')
      .eq('id', clientId)
      .single();

    if (convError) {
      logger('error', 'LGPD_EXPORT_LOOKUP_ERROR', { httpStatus: 500, userId: req.user?.id, conversationId: clientId, errorCode: 'LOOKUP_FAILED' });
      return res.status(500).json({ error: 'Erro ao consultar titular' });
    }

    if (!conversation) {
      logger('warn', 'LGPD_EXPORT_NOT_FOUND', { httpStatus: 404, userId: req.user?.id, conversationId: clientId });
      return res.status(404).json({ error: 'Titular não encontrado' });
    }

    const user = req.user;
    const isAdmin = user.role === 'admin';
    const isLawyer = user.role === 'advogado';
    const isOwner = conversation.assigned_user_id === user.id;

    if (!isAdmin && !isLawyer && !isOwner) {
      logger('warn', 'LGPD_EXPORT_FORBIDDEN', { httpStatus: 403, userId: user.id, conversationId: clientId });
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const exportedAt = new Date().toISOString();
    const payload = await buildExport({ supabase, conversationId: clientId, format });

    await supabase.rpc('log_audit', {
      p_user_id: user.id,
      p_entity_type: 'lgpd_export',
      p_entity_id: clientId,
      p_action: 'export_data',
      p_old_value: null,
      p_new_value: format,
      p_details: JSON.stringify({ format, exported_at: exportedAt, by_role: user.role })
    });

    if (format === 'csv') {
      const filename = `lgpd-export-${clientId}-${exportedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(payload);
    }

    return res.status(200).json(payload);
  } catch (error) {
    logger('error', 'LGPD_EXPORT_ERROR', { httpStatus: 500, userId: req.user?.id, conversationId: clientId, errorCode: 'EXPORT_FAILED' });
    return res.status(500).json({ error: 'Erro ao gerar exportação' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
