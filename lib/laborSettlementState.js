/**
 * Persistência segura e temporária do estado da simulação trabalhista.
 *
 * Regras:
 * - O payload sensível (collected) só persiste cifrado (AES-256-GCM).
 * - Não armazena texto original da mensagem, resposta da IA ou prompts.
 * - A aplicação deve validar o contexto de autorização antes de chamar qualquer operação.
 * - RLS por service_role é necessária, mas não suficiente: o backend deve garantir escopo.
 * - Estado expirado nunca é devolvido e pode ser removido.
 */

const { supabaseServer } = require('./supabaseServer');
const { encrypt, decrypt } = require('./encryption');

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const CURRENT_FLOW_VERSION = '1';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENCRYPTION_KEY_NAME = 'LABOR_STATE_ENCRYPTION_KEY';

class LaborStateError extends Error {
  constructor(message, code = 'LABOR_STATE_ERROR') {
    super(message);
    this.code = code;
    this.name = 'LaborStateError';
  }
}

function validateUuid(value) {
  if (!value || typeof value !== 'string' || !UUID_REGEX.test(value)) {
    throw new LaborStateError('conversation_id deve ser um UUID válido', 'INVALID_UUID');
  }
}

function isAuthorized(context, conversationId) {
  if (!context || typeof context !== 'object') {
    return false;
  }

  if (!context.userId) {
    return false;
  }

  if (typeof context.canAccessConversation === 'function') {
    // canAccessConversation deve ser síncrona e retornar exatamente true.
    // Qualquer outro retorno (inclusive Promise/truthy) é rejeitado.
    const result = context.canAccessConversation(conversationId);
    return result === true;
  }

  if (Array.isArray(context.allowedConversationIds)) {
    return context.allowedConversationIds.includes(conversationId);
  }

  if (context.allowedConversationId) {
    return context.allowedConversationId === conversationId;
  }

  return false;
}

function assertAuthorization(context, conversationId) {
  if (!isAuthorized(context, conversationId)) {
    throw new LaborStateError('Acesso não autorizado ao estado da conversa', 'UNAUTHORIZED');
  }
}

function assertSupabase() {
  if (!supabaseServer) {
    throw new LaborStateError('Cliente Supabase não configurado', 'SUPABASE_UNAVAILABLE');
  }
}

function toTimestamp(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}

function protectPayload(collected) {
  if (collected === undefined || collected === null) {
    collected = {};
  }
  const json = JSON.stringify(collected);
  try {
    return encrypt(json, ENCRYPTION_KEY_NAME);
  } catch (err) {
    throw new LaborStateError(
      'Não foi possível cifrar o estado. Verifique a chave de criptografia.',
      'ENCRYPTION_FAILED'
    );
  }
}

function unprotectPayload(protectedPayload) {
  if (!protectedPayload) {
    throw new LaborStateError('Payload protegido ausente', 'MISSING_PAYLOAD');
  }
  let json;
  try {
    json = decrypt(protectedPayload, ENCRYPTION_KEY_NAME);
  } catch (err) {
    throw new LaborStateError('Payload protegido inválido, corrompido ou sem chave', 'DECRYPTION_FAILED');
  }
  try {
    return JSON.parse(json);
  } catch (err) {
    throw new LaborStateError('Payload protegido não é JSON válido', 'INVALID_PAYLOAD');
  }
}

function normalizeDbRecord(record) {
  const collected = unprotectPayload(record.protected_payload);
  return {
    id: record.id,
    conversationId: record.conversation_id,
    active: record.active,
    intent: record.intent,
    status: record.status,
    askedFields: record.asked_fields || [],
    collected,
    lastMessageHash: record.last_message_hash,
    flowVersion: record.flow_version,
    expiresAt: record.expires_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

function isExpired(record, now) {
  const expires = record.expires_at ? new Date(record.expires_at) : null;
  return expires && expires <= new Date(now);
}

/**
 * Carrega o estado da simulação para uma conversa autorizada.
 * Não retorna estados expirados.
 */
async function loadLaborSettlementState({ conversationId, authorizationContext, now } = {}) {
  validateUuid(conversationId);
  assertAuthorization(authorizationContext, conversationId);
  assertSupabase();

  const asOf = now ? new Date(now) : new Date();

  const { data, error } = await supabaseServer
    .from('conversation_labor_states')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (error) {
    throw new LaborStateError('Falha ao carregar estado', 'LOAD_FAILED');
  }

  if (!data) {
    return null;
  }

  if (isExpired(data, asOf)) {
    await deleteLaborSettlementState({ conversationId, authorizationContext });
    return null;
  }

  if (data.flow_version !== CURRENT_FLOW_VERSION) {
    await deleteLaborSettlementState({ conversationId, authorizationContext });
    return null;
  }

  return normalizeDbRecord(data);
}

/**
 * Salva o estado da simulação para uma conversa autorizada.
 * Requer expectedUpdatedAt quando o estado já existe, para evitar sobrescrita silenciosa.
 */
async function saveLaborSettlementState({
  conversationId,
  state,
  authorizationContext,
  expectedUpdatedAt,
  now
} = {}) {
  validateUuid(conversationId);
  assertAuthorization(authorizationContext, conversationId);
  assertSupabase();

  if (!state || typeof state !== 'object') {
    throw new LaborStateError('state deve ser um objeto', 'INVALID_STATE');
  }

  const asOf = now ? new Date(now) : new Date();
  const expiresAt = new Date(asOf.getTime() + DEFAULT_TTL_MS).toISOString();
  const protectedPayload = protectPayload(state.collected);

  const { data: existing, error: loadError } = await supabaseServer
    .from('conversation_labor_states')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (loadError) {
    throw new LaborStateError('Falha ao verificar estado existente', 'CHECK_FAILED');
  }

  if (existing) {
    // Não permite ressuscitar registro expirado ou desatualizado
    if (isExpired(existing, asOf)) {
      await deleteLaborSettlementState({ conversationId, authorizationContext });
      throw new LaborStateError('Estado expirado. Inicie uma nova simulação.', 'STATE_EXPIRED');
    }

    if (existing.flow_version !== CURRENT_FLOW_VERSION) {
      await deleteLaborSettlementState({ conversationId, authorizationContext });
      throw new LaborStateError('Versão do fluxo incompatível. Inicie uma nova simulação.', 'FLOW_VERSION_INVALID');
    }

    // Idempotência: mesma mensagem não gera novo estado
    if (state.lastMessageHash && existing.last_message_hash === state.lastMessageHash) {
      return normalizeDbRecord(existing);
    }
  }

  const record = {
    conversation_id: conversationId,
    active: !!state.active,
    intent: state.intent || null,
    status: state.status || 'idle',
    asked_fields: Array.isArray(state.askedFields) ? state.askedFields : [],
    protected_payload: protectedPayload,
    last_message_hash: state.lastMessageHash || null,
    flow_version: CURRENT_FLOW_VERSION,
    expires_at: expiresAt
  };

  if (existing) {
    if (!expectedUpdatedAt) {
      throw new LaborStateError(
        'expectedUpdatedAt é obrigatório para atualização',
        'CONCURRENCY_CHECK_REQUIRED'
      );
    }

    const { data: updated, error: updateError } = await supabaseServer
      .from('conversation_labor_states')
      .update(record)
      .eq('conversation_id', conversationId)
      .eq('updated_at', toTimestamp(expectedUpdatedAt))
      .select()
      .maybeSingle();

    if (updateError || !updated) {
      throw new LaborStateError(
        'Conflito de concorrência: o estado foi alterado por outra requisição',
        'CONCURRENCY_CONFLICT'
      );
    }

    return normalizeDbRecord(updated);
  }

  const { data: inserted, error: insertError } = await supabaseServer
    .from('conversation_labor_states')
    .insert(record)
    .select()
    .maybeSingle();

  if (insertError || !inserted) {
    throw new LaborStateError('Falha ao criar estado', 'INSERT_FAILED');
  }

  return normalizeDbRecord(inserted);
}

/**
 * Remove o estado da simulação de uma conversa autorizada.
 */
async function deleteLaborSettlementState({ conversationId, authorizationContext } = {}) {
  validateUuid(conversationId);
  assertAuthorization(authorizationContext, conversationId);
  assertSupabase();

  const { error } = await supabaseServer
    .from('conversation_labor_states')
    .delete()
    .eq('conversation_id', conversationId);

  if (error) {
    throw new LaborStateError('Falha ao excluir estado', 'DELETE_FAILED');
  }

  return true;
}

/**
 * Remove o estado da conversa se ele estiver expirado.
 * Operação restrita à conversa autorizada.
 */
async function expireLaborSettlementState({ conversationId, authorizationContext, now } = {}) {
  validateUuid(conversationId);
  assertAuthorization(authorizationContext, conversationId);
  assertSupabase();

  const asOf = now ? new Date(now) : new Date();

  const { error } = await supabaseServer
    .from('conversation_labor_states')
    .delete()
    .eq('conversation_id', conversationId)
    .lt('expires_at', asOf.toISOString());

  if (error) {
    throw new LaborStateError('Falha ao expirar estado', 'EXPIRE_FAILED');
  }

  return true;
}

/**
 * Verifica se um estado retornado está expirado.
 */
function isLaborSettlementStateExpired(state, now) {
  if (!state || !state.expiresAt) return true;
  return new Date(state.expiresAt) <= new Date(now || new Date());
}

module.exports = {
  loadLaborSettlementState,
  saveLaborSettlementState,
  deleteLaborSettlementState,
  expireLaborSettlementState,
  isLaborSettlementStateExpired,
  LaborStateError,
  CURRENT_FLOW_VERSION,
  DEFAULT_TTL_MS
};
