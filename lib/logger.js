const SENSITIVE_KEYS = ['name', 'email', 'phone', 'client_phone', 'client_name', 'token', 'password', 'secret', 'url', 'signed_url', 'address'];
const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/,
  /\b\d{2}\.\d{3}\.\d{3}\/?\d{4}-?\d{2}\b/,
  /\b\d{2}\/\d{2}\/\d{4}\b/,
  /https?:\/\/[^\s]+/gi,
  /\bBearer\s+[A-Za-z0-9-_]+\b/
];

function sanitizeValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    let sanitized = value;
    PII_PATTERNS.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });
    if (sanitized.length > 200) {
      sanitized = `${sanitized.slice(0, 200)}...[TRUNCATED]`;
    }
    return sanitized;
  }
  if (typeof value === 'object' && value !== null) {
    const result = Array.isArray(value) ? [] : {};
    for (const key of Object.keys(value)) {
      if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitizeValue(value[key]);
      }
    }
    return result;
  }
  return value;
}

function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return {};

  const allowedKeys = ['userId', 'caseId', 'conversationId', 'documentId', 'templateId', 'routineId', 'errorCode', 'httpStatus', 'durationMs', 'action'];
  const sanitized = {};

  for (const key of allowedKeys) {
    if (context[key] !== undefined) {
      sanitized[key] = sanitizeValue(context[key]);
    }
  }

  if (context.error && typeof context.error === 'object') {
    sanitized.errorCode = context.errorCode || (context.error.message ? '[SANITIZED]' : undefined);
    sanitized.httpStatus = context.httpStatus || context.error.status;
  }

  return sanitized;
}

export default function logger(level, event, context = {}) {
  if (!['info', 'warn', 'error'].includes(level)) {
    level = 'info';
  }

  if (typeof event !== 'string' || !event) {
    event = 'UNKNOWN_EVENT';
  }

  const entry = {
    level,
    event: event.toUpperCase(),
    timestamp: new Date().toISOString(),
    context: sanitizeContext(context)
  };

  const output = JSON.stringify(entry);

  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }

  return entry;
}
