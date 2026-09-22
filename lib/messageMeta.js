const META_PREFIX = '__ncMeta__:';

export function buildMessageMeta({
  sourceMessageId = null,
  responseId = null,
  sequence = null,
  receivedAt = null,
  processedAt = null,
  sentAt = null
}) {
  return `${META_PREFIX}${JSON.stringify({
    source_message_id: sourceMessageId,
    response_id: responseId,
    sequence,
    received_at: receivedAt,
    processed_at: processedAt,
    sent_at: sentAt
  })}`;
}

export function parseMessageMeta(internalNote) {
  if (!internalNote || typeof internalNote !== 'string') return null;
  const str = String(internalNote);
  if (!str.startsWith(META_PREFIX)) return null;
  try {
    const data = JSON.parse(str.slice(META_PREFIX.length));
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

export function getSequenceFromMessage(message) {
  if (!message) return null;
  const meta = parseMessageMeta(message.internal_note);
  if (meta && typeof meta.sequence === 'number') return meta.sequence;
  return null;
}

export function sortMessagesBySequence(messages) {
  if (!Array.isArray(messages)) return [];
  return [...messages].sort((a, b) => {
    const sa = getSequenceFromMessage(a);
    const sb = getSequenceFromMessage(b);
    if (sa != null && sb != null) return sa - sb;
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function isInboundProcessed(intakeData, waMessageId) {
  if (!intakeData || !waMessageId) return false;
  return !!intakeData.processedMessageIds?.[waMessageId];
}

export function markInboundProcessed(intakeData, waMessageId, responseWaMessageIds = []) {
  if (!intakeData) return;
  if (!intakeData.processedMessageIds) {
    intakeData.processedMessageIds = {};
  }
  intakeData.processedMessageIds[waMessageId] = {
    response_wa_message_ids: responseWaMessageIds,
    processed_at: new Date().toISOString()
  };
  const keys = Object.keys(intakeData.processedMessageIds);
  if (keys.length > 100) {
    const toRemove = keys.slice(0, keys.length - 100);
    for (const k of toRemove) delete intakeData.processedMessageIds[k];
  }
}
