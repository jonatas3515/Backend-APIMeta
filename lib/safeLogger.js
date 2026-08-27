/**
 * Safe Logger - Sanitização de logs para prevenir exposição de PII
 * Nunca registra: telefone, CPF, CNPJ, e-mail, token, chave, URL assinada, storage_path, conteúdo de mensagem
 */

import crypto from 'crypto';

const isDev = () => process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'development';

/**
 * Mascara telefone: +55 11 99999-9999 → +55 11 ****-****
 */
export function maskPhone(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (str.length < 8) return null;
  // Mascara tudo após os primeiros 5 caracteres
  return str.slice(0, 5) + '****-****';
}

/**
 * Mascara CPF: 123.456.789-00 → 123.456.***-**
 */
export function maskCpfCnpj(value) {
  if (!value) return null;
  const str = String(value).replace(/\D/g, '');
  if (str.length < 8) return null;
  // Mascara tudo após os primeiros 5 dígitos
  return str.slice(0, 5) + '****';
}

/**
 * Mascara e-mail: user@example.com → u***@example.com
 */
export function maskEmail(value) {
  if (!value) return null;
  const str = String(value).trim();
  const [local, domain] = str.split('@');
  if (!local || !domain) return null;
  return local.charAt(0) + '***@' + domain;
}

/**
 * Remove Authorization header: Bearer token → [REDACTED]
 */
export function maskAuthorization(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (str.toLowerCase().startsWith('bearer ')) {
    return '[REDACTED_TOKEN]';
  }
  if (str.length > 10) {
    return '[REDACTED]';
  }
  return value;
}

/**
 * Remove URL com query token/signature: https://example.com?token=xyz → [REDACTED_URL]
 */
export function sanitizeUrl(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (!str.startsWith('http')) return null;
  try {
    const url = new URL(str);
    // Se tem parâmetros sensíveis, redact
    if (url.searchParams.has('token') || url.searchParams.has('signature') || url.searchParams.has('key')) {
      return '[REDACTED_SIGNED_URL]';
    }
    // Se tem storage_path, redact
    if (str.includes('storage_path') || str.includes('storage/')) {
      return '[REDACTED_STORAGE_URL]';
    }
    // URL segura, retorna apenas domínio
    return url.origin;
  } catch {
    return '[INVALID_URL]';
  }
}

/**
 * Sanitiza valor genérico para log
 * Remove: CPF, CNPJ, telefone, e-mail, token, chave, URL assinada, storage_path
 */
export function sanitizeForLog(value) {
  if (value === null || value === undefined) return null;

  const str = String(value).trim();
  if (!str) return null;

  // Detecta e remove CPF (XXX.XXX.XXX-XX)
  if (/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(str)) {
    return '[REDACTED_CPF]';
  }

  // Detecta e remove CNPJ (XX.XXX.XXX/XXXX-XX)
  if (/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(str)) {
    return '[REDACTED_CNPJ]';
  }

  // Detecta e remove telefone (formatado ou 10+ dígitos contínuos)
  if (/\(\d{2}\)\s?\d{4,5}-?\d{4}|\+\d{1,3}\s?\d{1,14}|\b\d{10,}\b/.test(str)) {
    return '[REDACTED_PHONE]';
  }

  // Detecta e remove e-mail
  if (/@/.test(str) && /\S+@\S+\.\S+/.test(str)) {
    return '[REDACTED_EMAIL]';
  }

  // Detecta e remove token/chave (incluindo JWT e strings longas base64)
  if (/bearer\s+\S+|api[_-]?key|authorization|token|secret|key/i.test(str)) {
    if (str.length > 20) {
      return '[REDACTED_TOKEN]';
    }
  }

  // Detecta JWT (3 partes base64url separadas por ponto)
  if (/^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(str)) {
    return '[REDACTED_TOKEN]';
  }

  // Detecta e remove storage_path e caminhos sensíveis
  if (/storage[_-]?path|storage\/|supabase\/storage|conversations\/|\/media\/.*\.[a-zA-Z0-9]{2,}$/i.test(str)) {
    return '[REDACTED_STORAGE_PATH]';
  }

  // Detecta e remove URL assinada
  if (/https?:\/\/.*[?&](token|signature|key|X-Amz-Signature)=/i.test(str)) {
    return '[REDACTED_SIGNED_URL]';
  }

  // Se é muito longo e parece ser conteúdo, trunca
  if (str.length > 500) {
    return str.slice(0, 100) + '... [TRUNCATED]';
  }

  return str;
}

/**
 * Sanitiza headers para log
 * Remove: Authorization, Cookie, X-API-Key, etc.
 */
export function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== 'object') return {};

  const safe = {};
  const sensitiveKeys = ['authorization', 'cookie', 'x-api-key', 'x-auth-token', 'x-access-token', 'x-secret', 'x-token'];

  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      safe[key] = '[REDACTED]';
    } else {
      safe[key] = sanitizeForLog(value);
    }
  }

  return safe;
}

/**
 * Hash curto não reversível para user_id (para rastreamento sem expor ID)
 */
export function hashUserId(userId) {
  if (!userId) return null;
  const secret = process.env.WEBHOOK_LOG_SECRET || process.env.WEBHOOK_VERIFY_TOKEN || 'fallback-secret';
  return crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 8);
}

/**
 * Log estruturado seguro
 * @param {string} level - 'info', 'warn', 'error'
 * @param {string} event - Nome do evento
 * @param {object} metadata - Metadados seguros
 */
export function safeLog(level, event, metadata = {}) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      level,
      event,
      ...metadata
    };

    const line = JSON.stringify(entry);

    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  } catch (err) {
    // Nunca lançar erro durante logging
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      event: 'safe_logger_error',
      message: 'Falha ao registrar log'
    }));
  }
}

/**
 * Log de erro estruturado seguro
 * @param {string} event - Nome do evento
 * @param {Error} error - Objeto de erro
 * @param {object} metadata - Metadados seguros
 */
export function safeError(event, error, metadata = {}) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      level: 'error',
      event,
      errorName: error?.name || 'Unknown',
      errorCode: error?.code || null,
      // Sanitiza mensagem de erro
      errorMessage: sanitizeForLog(error?.message || String(error))?.slice(0, 200),
      ...metadata
    };

    // Em desenvolvimento, inclui stack sanitizado
    if (isDev() && error?.stack) {
      const stackLines = String(error.stack)
        .split('\n')
        .slice(0, 3)
        .map(line => sanitizeForLog(line))
        .join('\n');
      entry.stack = stackLines;
    }

    const line = JSON.stringify(entry);
    console.error(line);
  } catch (err) {
    // Nunca lançar erro durante logging
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      event: 'safe_logger_error',
      message: 'Falha ao registrar erro'
    }));
  }
}

const safeLogger = {
  maskPhone,
  maskCpfCnpj,
  maskEmail,
  maskAuthorization,
  sanitizeUrl,
  sanitizeForLog,
  sanitizeHeaders,
  hashUserId,
  safeLog,
  safeError
};

export default safeLogger;
