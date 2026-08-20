import crypto from 'crypto';

const isDev = () => process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'development';

function getHmacKey() {
  // Chave exclusiva para hash pode ser definida em WEBHOOK_LOG_SECRET.
  // Se ausente, usa WEBHOOK_VERIFY_TOKEN, que já é server-side (não exposto ao frontend).
  return process.env.WEBHOOK_LOG_SECRET || process.env.WEBHOOK_VERIFY_TOKEN || 'fallback-secret';
}

export function hashPhone(phone) {
  if (!phone) return null;
  const normalized = String(phone).replace(/\D/g, '');
  if (!normalized) return null;
  return crypto.createHmac('sha256', getHmacKey()).update(normalized).digest('hex').slice(0, 16);
}

export function hashIdentifier(value) {
  if (!value) return null;
  return crypto.createHmac('sha256', getHmacKey()).update(String(value)).digest('hex').slice(0, 16);
}

export function sanitizeError(error) {
  if (!error) return null;
  const e = error instanceof Error ? error : new Error(String(error));
  // Limita a 200 caracteres e remove números longos (telefones, documentos, IDs) do texto.
  const message = String(e.message || String(error))
    .replace(/\b\d{10,}\b/g, '[NÚMERO]')
    .replace(/\S+@\S+\.\S+/g, '[EMAIL]')
    .slice(0, 200);
  return {
    name: e.name || 'Error',
    code: error.code || null,
    message
  };
}

export function createLogger(req) {
  const correlationId = crypto.randomUUID();
  const start = Date.now();

  const base = {
    source: 'webhook',
    ts: new Date().toISOString(),
    correlationId,
    method: req?.method,
    url: req?.url
  };

  function emit(level, event, meta = {}) {
    const duration = Date.now() - start;
    const entry = { ...base, level, event, duration };
    for (const [k, v] of Object.entries(meta)) {
      if (v !== undefined) entry[k] = v;
    }
    if (meta.stack && isDev()) {
      // Em desenvolvimento apenas, sem payload nem segredos.
      entry.stack = String(meta.stack).split('\n').slice(0, 5).join('\n');
    }
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }

  // Registro de entrada: sem body, headers, tokens, telefone, nome ou texto.
  emit('info', 'request_received', {
    hasBody: !!req?.body,
    contentType: req?.headers?.['content-type'] ? 'present' : 'absent'
  });

  function log(event, meta) {
    return emit('info', event, meta);
  }
  log.error = (event, meta) => emit('error', event, meta);
  log.warn = (event, meta) => emit('warn', event, meta);

  return { log, correlationId };
}
