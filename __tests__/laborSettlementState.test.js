/**
 * Testes de lib/laborSettlementState.js.
 * Todos os acessos ao Supabase são mockados; nenhuma chamada real é feita.
 * Usa LABOR_STATE_ENCRYPTION_KEY real para validar cifragem/autenticação.
 */

const fs = require('fs');
const path = require('path');

const UUID_1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const UUID_2 = 'b1ffcdaa-ad1c-5f19-cc7e-7cc0ce491b22';

process.env.LABOR_STATE_ENCRYPTION_KEY = '0'.repeat(64);

const { encrypt, decrypt } = require('../lib/encryption');

function createMockSupabase() {
  const builder = {
    _results: [],
    _result: null,
    _error: null,
    _shift() {
      return this._results.length ? this._results.shift() : this._result;
    },
    select: jest.fn(function () { return this; }),
    insert: jest.fn(function () { return this; }),
    update: jest.fn(function () { return this; }),
    upsert: jest.fn(function () { return this; }),
    delete: jest.fn(function () { return this; }),
    eq: jest.fn(function () { return this; }),
    neq: jest.fn(function () { return this; }),
    lt: jest.fn(function () { return this; }),
    lte: jest.fn(function () { return this; }),
    gt: jest.fn(function () { return this; }),
    gte: jest.fn(function () { return this; }),
    order: jest.fn(function () { return this; }),
    limit: jest.fn(function () { return this; }),
    maybeSingle: jest.fn(function () {
      const data = this._shift();
      return Promise.resolve({ data, error: this._error });
    }),
    single: jest.fn(function () {
      const data = this._shift();
      return Promise.resolve({ data, error: this._error });
    }),
    then(onFulfilled, onRejected) {
      return Promise.resolve({ data: this._result, error: this._error }).then(onFulfilled, onRejected);
    },
    _setResults(arr) {
      this._results = arr;
      this._error = null;
    },
    _setResult(data, error) {
      this._result = data;
      this._error = error;
      this._results = [];
    }
  };

  const supabase = { from: jest.fn(() => builder) };
  supabase._builder = builder;
  return supabase;
}

const mockSupabase = createMockSupabase();
const mockBuilder = mockSupabase._builder;

jest.mock('../lib/supabaseServer', () => ({
  supabaseServer: mockSupabase
}));

const {
  loadLaborSettlementState,
  saveLaborSettlementState,
  deleteLaborSettlementState,
  expireLaborSettlementState,
  isLaborSettlementStateExpired,
  LaborStateError
} = require('../lib/laborSettlementState');

function authFor(conversationId) {
  return { userId: UUID_1, allowedConversationId: conversationId };
}

function protect(collected) {
  return encrypt(JSON.stringify(collected), 'LABOR_STATE_ENCRYPTION_KEY');
}

function makeRecord(overrides = {}) {
  const collected = overrides.collected || { salary: 1234 };
  return {
    id: UUID_1,
    conversation_id: overrides.conversationId || UUID_1,
    active: overrides.active !== undefined ? overrides.active : true,
    intent: overrides.intent || 'labor_settlement_estimate',
    status: overrides.status || 'collecting',
    asked_fields: overrides.askedFields || ['salary'],
    protected_payload: overrides.protectedPayload !== undefined
      ? overrides.protectedPayload
      : protect(collected),
    last_message_hash: overrides.lastMessageHash || null,
    flow_version: overrides.flowVersion || '1',
    expires_at: overrides.expiresAt || new Date(Date.now() + 3600000).toISOString(),
    created_at: overrides.createdAt || new Date().toISOString(),
    updated_at: overrides.updatedAt || new Date().toISOString()
  };
}

function makeState(overrides = {}) {
  return {
    active: true,
    intent: 'labor_settlement_estimate',
    collected: { salary: 1234 },
    askedFields: ['salary'],
    status: 'collecting',
    lastMessageHash: null,
    ...overrides
  };
}

describe('laborSettlementState', () => {
  beforeEach(() => {
    mockBuilder._setResult(null, null);
    mockSupabase.from.mockClear();
    mockBuilder.select.mockClear();
    mockBuilder.insert.mockClear();
    mockBuilder.update.mockClear();
    mockBuilder.delete.mockClear();
    mockBuilder.eq.mockClear();
    mockBuilder.maybeSingle.mockClear();
    mockBuilder.lt.mockClear();
    if (!process.env.LABOR_STATE_ENCRYPTION_KEY) {
      process.env.LABOR_STATE_ENCRYPTION_KEY = '0'.repeat(64);
    }
  });

  test('UUID inválido é rejeitado', async () => {
    await expect(
      loadLaborSettlementState({ conversationId: 'não-é-uuid', authorizationContext: authFor('não-é-uuid') })
    ).rejects.toThrow('conversation_id deve ser um UUID válido');
  });

  test('ausência de authorizationContext é rejeitada', async () => {
    await expect(
      loadLaborSettlementState({ conversationId: UUID_1 })
    ).rejects.toThrow('Acesso não autorizado');
  });

  test('contexto sem escopo autorizado é rejeitado', async () => {
    await expect(
      loadLaborSettlementState({ conversationId: UUID_1, authorizationContext: { userId: UUID_1 } })
    ).rejects.toThrow('Acesso não autorizado');
  });

  test('conversa fora do escopo é rejeitada', async () => {
    await expect(
      loadLaborSettlementState({ conversationId: UUID_1, authorizationContext: authFor(UUID_2) })
    ).rejects.toThrow('Acesso não autorizado');
  });

  test('canAccessConversation === true permite acesso', async () => {
    const record = makeRecord({ conversationId: UUID_1 });
    mockBuilder._setResult(record, null);

    const state = await loadLaborSettlementState({
      conversationId: UUID_1,
      authorizationContext: {
        userId: UUID_1,
        canAccessConversation: (id) => id === UUID_1
      }
    });

    expect(state).not.toBeNull();
    expect(state.conversationId).toBe(UUID_1);
  });

  test('canAccessConversation === false rejeita', async () => {
    await expect(
      loadLaborSettlementState({
        conversationId: UUID_1,
        authorizationContext: {
          userId: UUID_1,
          canAccessConversation: () => false
        }
      })
    ).rejects.toThrow('Acesso não autorizado');
  });

  test('canAccessConversation retornando Promise é rejeitado de forma segura', async () => {
    await expect(
      loadLaborSettlementState({
        conversationId: UUID_1,
        authorizationContext: {
          userId: UUID_1,
          canAccessConversation: () => Promise.resolve(true)
        }
      })
    ).rejects.toThrow('Acesso não autorizado');
  });

  test('estado não expirado pode ser carregado', async () => {
    const record = makeRecord({ conversationId: UUID_1 });
    mockBuilder._setResult(record, null);

    const state = await loadLaborSettlementState({
      conversationId: UUID_1,
      authorizationContext: authFor(UUID_1)
    });

    expect(state).not.toBeNull();
    expect(state.conversationId).toBe(UUID_1);
    expect(state.collected.salary).toBe(1234);
    expect(mockSupabase.from).toHaveBeenCalledWith('conversation_labor_states');
  });

  test('estado expirado não é retornado', async () => {
    const record = makeRecord({ conversationId: UUID_1, expiresAt: '2020-01-01T00:00:00.000Z' });
    mockBuilder._setResult(record, null);

    const state = await loadLaborSettlementState({
      conversationId: UUID_1,
      authorizationContext: authFor(UUID_1)
    });

    expect(state).toBeNull();
    expect(mockBuilder.delete).toHaveBeenCalled();
  });

  test('estado expirado é tratado corretamente', () => {
    const expired = {
      expiresAt: '2020-01-01T00:00:00.000Z'
    };
    expect(isLaborSettlementStateExpired(expired, new Date())).toBe(true);
  });

  test('flow_version incompatível invalida o estado', async () => {
    const record = makeRecord({ conversationId: UUID_1, flowVersion: '0' });
    mockBuilder._setResult(record, null);

    const state = await loadLaborSettlementState({
      conversationId: UUID_1,
      authorizationContext: authFor(UUID_1)
    });

    expect(state).toBeNull();
  });

  test('save com expectedUpdatedAt correto atualiza estado', async () => {
    const existing = makeRecord({
      conversationId: UUID_1,
      updatedAt: '2024-01-01T00:00:00.000Z',
      collected: { salary: 1000 }
    });
    const updated = makeRecord({
      conversationId: UUID_1,
      collected: { salary: 2000 },
      updatedAt: '2024-01-01T01:00:00.000Z'
    });
    mockBuilder._setResults([existing, updated]);

    const state = await saveLaborSettlementState({
      conversationId: UUID_1,
      state: makeState({ collected: { salary: 2000 } }),
      authorizationContext: authFor(UUID_1),
      expectedUpdatedAt: '2024-01-01T00:00:00.000Z'
    });

    expect(state.collected.salary).toBe(2000);
    expect(mockBuilder.update).toHaveBeenCalled();
    expect(mockBuilder.insert).not.toHaveBeenCalled();
  });

  test('last_message_hash repetido é idempotente', async () => {
    const record = makeRecord({
      conversationId: UUID_1,
      lastMessageHash: 'abc123',
      collected: { salary: 5000 }
    });
    mockBuilder._setResult(record, null);

    const state = await saveLaborSettlementState({
      conversationId: UUID_1,
      state: makeState({ collected: { salary: 5000 }, lastMessageHash: 'abc123' }),
      authorizationContext: authFor(UUID_1)
    });

    expect(state.collected.salary).toBe(5000);
    expect(mockBuilder.update).not.toHaveBeenCalled();
    expect(mockBuilder.insert).not.toHaveBeenCalled();
  });

  test('expectedUpdatedAt diferente gera conflito', async () => {
    const existing = makeRecord({
      conversationId: UUID_1,
      updatedAt: '2024-01-01T00:00:00.000Z'
    });
    mockBuilder._setResults([existing, null]);

    await expect(
      saveLaborSettlementState({
        conversationId: UUID_1,
        state: makeState(),
        authorizationContext: authFor(UUID_1),
        expectedUpdatedAt: '2024-01-02T00:00:00.000Z'
      })
    ).rejects.toThrow('Conflito de concorrência');
  });

  test('save sobre estado expirado não ressuscita o registro', async () => {
    const existing = makeRecord({
      conversationId: UUID_1,
      expiresAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    });
    mockBuilder._setResult(existing, null);

    await expect(
      saveLaborSettlementState({
        conversationId: UUID_1,
        state: makeState(),
        authorizationContext: authFor(UUID_1),
        expectedUpdatedAt: '2024-01-01T00:00:00.000Z'
      })
    ).rejects.toThrow('Estado expirado');

    expect(mockBuilder.delete).toHaveBeenCalled();
    expect(mockBuilder.update).not.toHaveBeenCalled();
  });

  test('save sobre flow_version incompatível não renova', async () => {
    const existing = makeRecord({
      conversationId: UUID_1,
      flowVersion: '0',
      updatedAt: '2024-01-01T00:00:00.000Z'
    });
    mockBuilder._setResult(existing, null);

    await expect(
      saveLaborSettlementState({
        conversationId: UUID_1,
        state: makeState(),
        authorizationContext: authFor(UUID_1),
        expectedUpdatedAt: '2024-01-01T00:00:00.000Z'
      })
    ).rejects.toThrow('Versão do fluxo incompatível');

    expect(mockBuilder.delete).toHaveBeenCalled();
    expect(mockBuilder.update).not.toHaveBeenCalled();
  });

  test('sem LABOR_STATE_ENCRYPTION_KEY save falha fechado', async () => {
    const original = process.env.LABOR_STATE_ENCRYPTION_KEY;
    delete process.env.LABOR_STATE_ENCRYPTION_KEY;

    try {
      await expect(
        saveLaborSettlementState({
          conversationId: UUID_1,
          state: makeState(),
          authorizationContext: authFor(UUID_1)
        })
      ).rejects.toThrow('Não foi possível cifrar o estado');
    } finally {
      process.env.LABOR_STATE_ENCRYPTION_KEY = original;
    }
  });

  test('payload não aparece em logs', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const record = makeRecord({ conversationId: UUID_1 });
    mockBuilder._setResult(record, null);

    await loadLaborSettlementState({
      conversationId: UUID_1,
      authorizationContext: authFor(UUID_1)
    });

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('payload não é armazenado em claro', async () => {
    const state = makeState({ collected: { salary: 3000 }, lastMessageHash: 'hash' });
    const inserted = makeRecord({
      conversationId: UUID_1,
      collected: { salary: 3000 },
      lastMessageHash: 'hash'
    });
    mockBuilder._setResults([null, inserted]);

    await saveLaborSettlementState({
      conversationId: UUID_1,
      state,
      authorizationContext: authFor(UUID_1)
    });

    const insertCall = mockBuilder.insert.mock.calls[0];
    expect(insertCall).toBeDefined();
    const record = insertCall[0];
    expect(record.protected_payload).toMatch(/^[0-9a-fA-F]{32}:[0-9a-fA-F]{32}:[0-9a-fA-F]+$/);
    expect(record.protected_payload).not.toContain('salary');
    expect(record.protected_payload).not.toContain('3000');
    expect(record).not.toHaveProperty('message');
    expect(record).not.toHaveProperty('originalMessage');
    expect(record).not.toHaveProperty('response');
    expect(record).not.toHaveProperty('aiReply');
    expect(record).not.toHaveProperty('calculation');
  });

  test('falha de descriptografia é sanitizada', async () => {
    const record = makeRecord({
      conversationId: UUID_1,
      protectedPayload: 'não-é-ciphertext'
    });
    mockBuilder._setResult(record, null);

    await expect(
      loadLaborSettlementState({
        conversationId: UUID_1,
        authorizationContext: authFor(UUID_1)
      })
    ).rejects.toThrow('Payload protegido inválido');
  });

  test('delete só funciona no escopo autorizado', async () => {
    await expect(
      deleteLaborSettlementState({ conversationId: UUID_1, authorizationContext: authFor(UUID_2) })
    ).rejects.toThrow('Acesso não autorizado');
  });

  test('delete autorizado funciona', async () => {
    await deleteLaborSettlementState({
      conversationId: UUID_1,
      authorizationContext: authFor(UUID_1)
    });
    expect(mockBuilder.delete).toHaveBeenCalled();
  });

  test('expiração remove registro vencido', async () => {
    const existing = makeRecord({
      conversationId: UUID_1,
      expiresAt: '2020-01-01T00:00:00.000Z'
    });
    mockBuilder._setResult(existing, null);

    await expireLaborSettlementState({
      conversationId: UUID_1,
      authorizationContext: authFor(UUID_1),
      now: new Date()
    });

    expect(mockBuilder.delete).toHaveBeenCalled();
    expect(mockBuilder.lt).toHaveBeenCalledWith('expires_at', expect.any(String));
  });

  test('expiração só ocorre no escopo autorizado', async () => {
    await expect(
      expireLaborSettlementState({
        conversationId: UUID_1,
        authorizationContext: authFor(UUID_2),
        now: new Date()
      })
    ).rejects.toThrow('Acesso não autorizado');
  });

  test('erro do Supabase é sanitizado', async () => {
    mockBuilder._setResult(null, { code: 'PGRST000', message: 'erro interno sensível' });

    await expect(
      loadLaborSettlementState({
        conversationId: UUID_1,
        authorizationContext: authFor(UUID_1)
      })
    ).rejects.toThrow('Falha ao carregar estado');
  });

  test('LaborStateError expõe code sanitizado', async () => {
    mockBuilder._setResult(null, { code: 'PGRST000', message: 'erro interno sensível' });

    await expect(
      loadLaborSettlementState({
        conversationId: UUID_1,
        authorizationContext: authFor(UUID_1)
      })
    ).rejects.toMatchObject({
      code: 'LOAD_FAILED',
      name: 'LaborStateError'
    });
  });

  describe('migration 059', () => {
    const migrationPath = path.join(
      process.cwd(),
      'supabase',
      'migrations',
      '059_add_conversation_labor_states.sql'
    );

    test('arquivo de migration existe', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    test('ON DELETE CASCADE está documentado', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('ON DELETE CASCADE');
    });

    test('protected_payload possui CHECK de formato cifrado', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toMatch(/protected_payload\s+TEXT\s+NOT\s+NULL\s+CHECK/i);
      expect(sql).toMatch(/CHECK\s*\(\s*protected_payload\s+~/i);
    });

    test('RLS está habilitado e possui policies restritivas', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('CREATE POLICY');
      expect(sql).toContain('service_role');
      expect(sql).toMatch(/conversation_labor_states_service_role_only/);
      expect(sql).toMatch(/conversation_labor_states_no_anon/);
      expect(sql).toMatch(/conversation_labor_states_no_authenticated/);
    });

    test('não há acesso anon/authenticated/public desprotegido', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).not.toMatch(/TO\s+public\s+USING\s*\(\s*true\s*\)/i);
      expect(sql).toMatch(/TO\s+anon\s+USING\s*\(\s*false\s*\)/i);
      expect(sql).toMatch(/TO\s+authenticated\s+USING\s*\(\s*false\s*\)/i);
    });
  });
});
