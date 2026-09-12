const VALID_PURPOSES = ['whatsapp_contact', 'email_marketing', 'data_processing', 'marketing', 'signature', 'retention'];
const VALID_BASES = ['consent', 'contract', 'legal_obligation', 'legitimate_interest'];
const VALID_CHANNELS = ['whatsapp', 'email', 'web', 'in_person', 'panel'];

export function validateConsent(payload) {
  const errors = [];

  if (!payload.clientId) {
    errors.push('clientId é obrigatório');
  }

  if (!payload.purpose || !VALID_PURPOSES.includes(payload.purpose)) {
    errors.push('purpose inválido ou ausente');
  }

  if (!payload.legalBasis || !VALID_BASES.includes(payload.legalBasis)) {
    errors.push('legalBasis inválida ou ausente');
  }

  if (!payload.channel || !VALID_CHANNELS.includes(payload.channel)) {
    errors.push('channel inválido ou ausente');
  }

  if (!payload.version || typeof payload.version !== 'string' || payload.version.length > 20) {
    errors.push('version é obrigatória e deve ter no máximo 20 caracteres');
  }

  return { valid: errors.length === 0, errors };
}

export function normalizeConsent(row) {
  return {
    id: row.id,
    clientId: row.conversation_id,
    purpose: row.consent_type,
    legalBasis: row.legal_basis,
    channel: row.channel,
    version: row.term_version,
    notes: row.notes || null,
    value: row.value,
    createdAt: row.created_at,
    revokedAt: row.revoked_at || null,
    active: row.revoked_at === null || row.revoked_at === undefined
  };
}
