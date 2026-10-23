/**
 * Testes - Campos processuais avancados em /api/cases
 * Garante retrocompatibilidade com casos antigos e sanitizacao dos novos campos
 */

const { createMocks } = require('node-mocks-http');
const casesHandler = require('../pages/api/cases').default;

jest.mock('../lib/auth', () => ({
  withAuth: (fn) => (req, res) => {
    req.user = req.__testUser || { role: 'advogado', id: 'user-1' };
    return fn(req, res);
  },
  hasMinimumRole: () => true
}));

function supabaseBuilder() {
  const chain = {
    from: jest.fn(() => chain),
    select: jest.fn(() => chain),
    order: jest.fn(() => chain),
    eq: jest.fn((field, value) => {
      global.__supabaseEqCalls = global.__supabaseEqCalls || [];
      global.__supabaseEqCalls.push({ field, value });
      return chain;
    }),
    neq: jest.fn(() => chain),
    is: jest.fn(() => chain),
    in: jest.fn(() => chain),
    ilike: jest.fn((field, value) => {
      global.__supabaseIlike = { field, value };
      return chain;
    }),
    update: jest.fn((payload) => {
      global.__supabaseUpdate = payload;
      return chain;
    }),
    insert: jest.fn((payload) => {
      global.__supabaseInsert = payload;
      return chain;
    }),
    delete: jest.fn(() => chain),
    maybeSingle: jest.fn(() => chain),
    single: jest.fn(() => chain),
    then: (onFulfilled) => {
      const next = global.__supabaseQueue ? global.__supabaseQueue.shift() : { data: null, error: null };
      return onFulfilled ? onFulfilled(next) : Promise.resolve(next);
    }
  };
  return chain;
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => supabaseBuilder())
}));

describe('API /api/cases - campos processuais', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
    global.__supabaseInsert = null;
    global.__supabaseUpdate = null;
    global.__supabaseIlike = null;
    global.__supabaseEqCalls = [];
  });

  test('POST sem campos processuais continua funcionando (retrocompatibilidade)', async () => {
    global.__supabaseQueue = [
      { data: { id: 'case-new', title: 'Caso Antigo' }, error: null }
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: { title: 'Caso Antigo' },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(global.__supabaseInsert).toMatchObject({
      title: 'Caso Antigo',
      process_number: null,
      court: null,
      court_division: null,
      judicial_district: null,
      procedural_step: null,
      case_value: null,
      distribution_date: null
    });
  });

  test('POST com campos processuais sanitiza e persiste', async () => {
    global.__supabaseQueue = [
      { data: { id: 'case-new' }, error: null }
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        title: 'Caso Trabalhista',
        process_number: '  0001234-56.2024.5.02.0001  ',
        court: 'TRT',
        court_division: '2a Vara do Trabalho',
        judicial_district: 'Maceio',
        procedural_step: 'instrucao',
        case_value: '25000.75',
        distribution_date: '2024-03-10'
      },
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(global.__supabaseInsert).toMatchObject({
      process_number: '0001234-56.2024.5.02.0001',
      court: 'TRT',
      court_division: '2a Vara do Trabalho',
      judicial_district: 'Maceio',
      procedural_step: 'instrucao',
      case_value: 25000.75,
      distribution_date: '2024-03-10'
    });
  });

  test('POST com case_value invalido retorna 400', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { title: 'Caso X', case_value: 'abc' },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toMatch(/Valor da causa/i);
    expect(global.__supabaseInsert).toBeNull();
  });

  test('POST por estagiario continua proibido', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { title: 'Caso X', process_number: '123' },
      __testUser: { role: 'estagiario', id: 'user-2' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(global.__supabaseInsert).toBeNull();
  });

  test('PATCH com campos processuais sanitiza e atualiza', async () => {
    global.__supabaseQueue = [
      { data: { id: 'case-1', procedural_step: 'recurso' }, error: null }
    ];

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'case-1' },
      body: {
        procedural_step: 'recurso',
        case_value: '1000',
        distribution_date: '',
        court: '  TJ  '
      },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(global.__supabaseUpdate).toMatchObject({
      procedural_step: 'recurso',
      case_value: 1000,
      distribution_date: null,
      court: 'TJ'
    });
    expect(global.__supabaseUpdate).not.toHaveProperty('id');
  });

  test('PATCH com distribution_date invalida retorna 400', async () => {
    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'case-1' },
      body: { distribution_date: 'nao-e-data' },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toMatch(/Data de distribui/i);
    expect(global.__supabaseUpdate).toBeNull();
  });

  test('PATCH sem campos validos retorna 400', async () => {
    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'case-1' },
      body: { campo_inexistente: 'x' },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(global.__supabaseUpdate).toBeNull();
  });

  test('GET com filtro process_number aplica ilike e retorna casos', async () => {
    global.__supabaseQueue = [
      { data: [{ id: 'case-9', process_number: '0001234-56.2024.5.02.0001' }], error: null }
    ];

    const { req, res } = createMocks({
      method: 'GET',
      query: { process_number: '0001234' },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(global.__supabaseIlike).toEqual({
      field: 'process_number',
      value: '%0001234%'
    });
    const data = res._getJSONData();
    expect(data).toHaveLength(1);
    expect(data[0].process_number).toBe('0001234-56.2024.5.02.0001');
  });

  test('GET com filtro court aplica eq e retorna casos', async () => {
    global.__supabaseQueue = [
      { data: [{ id: 'case-10', court: 'TRT' }], error: null }
    ];

    const { req, res } = createMocks({
      method: 'GET',
      query: { court: 'TRT' },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(global.__supabaseEqCalls).toContainEqual({ field: 'court', value: 'TRT' });
    const data = res._getJSONData();
    expect(data).toHaveLength(1);
    expect(data[0].court).toBe('TRT');
  });

  test('GET com filtro procedural_step aplica eq e retorna casos', async () => {
    global.__supabaseQueue = [
      { data: [{ id: 'case-11', procedural_step: 'execucao' }], error: null }
    ];

    const { req, res } = createMocks({
      method: 'GET',
      query: { procedural_step: 'execucao' },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(global.__supabaseEqCalls).toContainEqual({ field: 'procedural_step', value: 'execucao' });
    const data = res._getJSONData();
    expect(data).toHaveLength(1);
    expect(data[0].procedural_step).toBe('execucao');
  });
});

describe('exportCasesExcel - colunas processuais', () => {
  const { exportCasesExcel } = require('../lib/export');

  jest.mock('xlsx', () => {
    const captured = { rows: [] };
    return {
      utils: {
        json_to_sheet: jest.fn((rows) => { captured.rows.push(rows); return {}; }),
        book_new: jest.fn(() => ({})),
        book_append_sheet: jest.fn()
      },
      write: jest.fn(() => []),
      __captured: captured
    };
  });

  beforeEach(() => {
    global.URL = global.URL || {};
    global.URL.createObjectURL = jest.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = jest.fn();
    global.Blob = jest.fn((parts, opts) => ({ parts, opts }));
    document.createElement = jest.fn(() => ({ click: jest.fn(), remove: jest.fn() }));
    document.body.appendChild = jest.fn();
  });

  test('inclui as colunas processuais na planilha', async () => {
    await exportCasesExcel([
      {
        id: 'case-1',
        title: 'Caso Trabalhista',
        status: 'em_analise',
        process_number: '0001234-56.2024.5.02.0001',
        court: 'TRT',
        court_division: '2a Vara do Trabalho',
        judicial_district: 'Maceio',
        procedural_step: 'instrucao',
        case_value: 25000.75,
        distribution_date: '2024-03-10'
      }
    ]);

    const XLSX = require('xlsx');
    const rows = XLSX.__captured.rows[0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      'Número do Processo': '0001234-56.2024.5.02.0001',
      Tribunal: 'TRT',
      Vara: '2a Vara do Trabalho',
      Comarca: 'Maceio',
      'Fase Processual': 'instrucao'
    });
    expect(rows[0]['Data de Distribuição']).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(rows[0]['Valor da Causa']).toMatch(/25[.,]?000[.,]75/);
  });

  test('caso sem dados processuais exporta colunas vazias sem quebrar', async () => {
    await exportCasesExcel([
      { id: 'case-2', title: 'Caso Antigo', status: 'prospect' }
    ]);

    const XLSX = require('xlsx');
    const rows = XLSX.__captured.rows.flat();
    const row = rows[rows.length - 1];
    expect(row['Número do Processo']).toBeUndefined();
    expect(row['Valor da Causa']).toBe('-');
    expect(row['Data de Distribuição']).toBe('-');
  });
});
