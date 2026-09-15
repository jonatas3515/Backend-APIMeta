/**
 * Testes de lib/laborSettlementState.js.
 * Todos os acessos ao Supabase são mockados; nenhuma chamada real é feita.
 */

const fs = require('fs');
const path = require('path');

const UUID_1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const UUID_2 = 'b1ffcdaa-ad1c-5f19-cc7e-7cc0ce491b22';

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

jest.mock('../lib/encryption', () => ({
  encrypt: jest.fn((text) => `enc:${text}`),
  decrypt: jest.fn((text) => String(text).replace(/^enc:/, ''))
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

function makeRecord(overrides = {}) {
  const collected = overrides.collected || { salary: 1234 };
  return {
    id: UUID_1,
    conversation_id: overrides.conversationId || UUID_1,
    active: overrides.active !== undefined ? overrides.active : true,
    intent: overrides.intent || 'labor_settlement_estimate',
    status: overrides.status || 'collecting',
    asked_fields: overrides.askedFields || ['salary'],
    protected_payload: `enc:${JSON.stringify(collected)}`,
    last_message_hash: overrides.lastMessageHash || null,
    flow_version: overrides.flowVersion || '1',
    expires_at: overrides.expiresAt || new Date(Date.now() + 3600000).toISOString(),
    created_at: overrides.createdAt || new Date().toISOString(),
    updated_at: overrides.updatedAt || new Date().toISOString()
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

  test('last_message_hash repetido é idempotente', async () => {
    const record = makeRecord({
      conversationId: UUID_1,
      lastMessageHash: 'abc123',
      collected: { salary: 5000 }
    });
    mockBuilder._setResult(record, null);

    const state = await saveLaborSettlementState({
      conversationId: UUID_1,
      state: {
        active: true,
        intent: 'labor_settlement_estimate',
        collected: { salary: 5000 },
        askedFields: ['salary'],
        status: 'collecting',
        lastMessageHash: 'abc123'
      },
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
        state: {
          active: true,
          collected: { salary: 1234 },
          askedFields: ['salary'],
          status: 'collecting'
        },
        authorizationContext: authFor(UUID_1),
        expectedUpdatedAt: '2024-01-02T00:00:00.000Z'
      })
    ).rejects.toThrow('Conflito de concorrência');
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

  test('mensagem original não é armazenada', async () => {
    const state = {
      active: true,
      intent: 'labor_settlement_estimate',
      collected: { salary: 3000 },
      askedFields: ['salary'],
      status: 'collecting',
      lastMessageHash: 'hash-da-mensagem'
    };

    const inserted = makeRecord({
      conversationId: UUID_1,
      collected: { salary: 3000 },
      protected_payload: `enc:${JSON.stringify({ salary: 3000 })}`,
      last_message_hash: 'hash-da-mensagem'
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
    expect(record).not.toHaveProperty('message');
    expect(record).not.toHaveProperty('originalMessage');
    expect(record).toHaveProperty('last_message_hash');
    expect(record).toHaveProperty('protected_payload');
  });

  test('resposta completa não é armazenada', async () => {
    const state = {
      active: true,
      intent: 'labor_settlement_estimate',
      collected: { salary: 3000 },
      askedFields: ['salary'],
      status: 'collecting',
      lastMessageHash: 'hash'
    };

    const inserted = makeRecord({
      conversationId: UUID_1,
      collected: { salary: 3000 },
      protected_payload: `enc:${JSON.stringify({ salary: 3000 })}`,
      last_message_hash: 'hash'
    });
    mockBuilder._setResults([null, inserted]);

    await saveLaborSettlementState({
      conversationId: UUID_1,
      state,
      authorizationContext: authFor(UUID_1)
    });

    const insertCall = mockBuilder.insert.mock.calls[0];
    const record = insertCall[0];
    expect(record).not.toHaveProperty('response');
    expect(record).not.toHaveProperty('aiReply');
    expect(record).not.toHaveProperty('calculation');
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

    test('RLS está habilitado e possui policies restritivas', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('CREATE POLICY');
      expect(sql).toContain('service_role');
      expect(sql).toMatch(/conversation_labor_states_service_role_only/);
      expect(sql).toMatch(/conversation_labor_states_no_anon/);
    });

    test('não há acesso anon/public desprotegido', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).not.toMatch(/TO\s+public\s+USING\s*\(\s*true\s*\)/i);
      const anonLines = sql.match(/TO\s+anon\s+USING\s*\(\s*false\s*\)/i);
      expect(anonLines).toBeTruthy();
    });
  });
});
