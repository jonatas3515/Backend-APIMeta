const counters = new Map();

const VALID_FEATURES = new Set([
  'cases',
  'conversations',
  'document_requests',
  'generated_documents',
  'case_routines',
  'fee_simulator'
]);

const VALID_ACTIONS = new Set([
  'create',
  'update',
  'delete',
  'link',
  'unlink',
  'generate',
  'execute',
  'save',
  'send',
  'resend'
]);

export function incrementMetric(feature, action, delta = 1) {
  if (!VALID_FEATURES.has(feature)) {
    console.warn(`[METRICS] Feature invalida: ${feature}`);
    return;
  }

  if (!VALID_ACTIONS.has(action)) {
    console.warn(`[METRICS] Acao invalida: ${action}`);
    return;
  }

  const count = Number.isInteger(delta) ? delta : 1;
  const key = `${feature}:${action}`;
  counters.set(key, (counters.get(key) || 0) + count);
}

export function getMetricsSnapshot() {
  const snapshot = {};
  for (const [key, value] of counters.entries()) {
    snapshot[key] = value;
  }
  return snapshot;
}

export function resetMetrics() {
  counters.clear();
}

export function getMetricsKeys() {
  return Array.from(counters.keys());
}
