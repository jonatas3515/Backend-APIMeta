const ANONYMIZED_NAME_PREFIX = 'Cliente';
const MAX_REASON_LENGTH = 500;

export const DELETION_MODES = ['full', 'anonymized'];
export const DELETION_REASONS = ['lgpd_request', 'client_request', 'internal_review', 'other'];

export function validateDeletionRequest(payload) {
  const errors = [];

  if (!payload.clientId) {
    errors.push('clientId é obrigatório');
  }

  if (!DELETION_MODES.includes(payload.mode)) {
    errors.push('mode deve ser "full" ou "anonymized"');
  }

  if (!DELETION_REASONS.includes(payload.reason)) {
    errors.push('reason inválido');
  }

  if (payload.notes && typeof payload.notes === 'string' && payload.notes.length > MAX_REASON_LENGTH) {
    errors.push(`notes deve ter no máximo ${MAX_REASON_LENGTH} caracteres`);
  }

  return { valid: errors.length === 0, errors };
}

export function generateAnonymizedName(clientId) {
  const shortId = clientId.slice(-6).toUpperCase();
  return `${ANONYMIZED_NAME_PREFIX} #${shortId}`;
}

export function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  return phone.replace(/\d(?=\d{4})/g, '*');
}

export function maskEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const maskedLocal = local.length > 2 ? `${local.slice(0, 2)}***` : '***';
  return `${maskedLocal}@${domain}`;
}

export function anonymizeClientProfile(client) {
  const shortId = client.id.slice(-6).toUpperCase();
  return {
    client_name: generateAnonymizedName(client.id),
    client_phone: maskPhone(client.client_phone),
    client_email: maskEmail(client.client_email),
    client_cpf_cnpj: null,
    address: null,
    municipality: null,
    state: null,
    agency: null,
    client_role: null,
    case_summary: null,
    intake_data: null,
    is_client: false,
    funnel_stage: 'encerrado',
    status: 'anonymized',
    anonymized_at: new Date().toISOString(),
    anonymized: true
  };
}

export function hasActiveCases(cases) {
  return cases.some(c => c.status && !['closed', 'encerrado', 'arquivado'].includes(c.status.toLowerCase()));
}
