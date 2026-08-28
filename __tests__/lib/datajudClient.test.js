/**
 * DataJud Client Tests
 * Tests public DataJud client without calling real CNJ API
 */

const {
  validateAndNormalizeCNJ,
  resolveDataJudAlias,
  queryDataJud,
} = require('../../lib/datajudClient');

describe('DataJud Client', () => {
  const VALID_CNJ = '0000001-83.0000.0.00.0000';
  const VALID_CNJ_NORMALIZED = '00000018300000000000';

  const VALID_COURT = 'TJSP';
  const INVALID_COURT = 'TRT99';

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('valida e normaliza CNJ correto', () => {
    const result = validateAndNormalizeCNJ(VALID_CNJ);
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe(VALID_CNJ_NORMALIZED);
    expect(result.formatted).toBe(VALID_CNJ);
  });

  test('rejeita CNJ com tamanho incorreto', () => {
    const result = validateAndNormalizeCNJ('12345');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('20 dígitos');
  });

  test('rejeita CNJ com dígito verificador inválido', () => {
    const result = validateAndNormalizeCNJ('0000001-84.0000.0.00.0000');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Dígitos verificadores');
  });

  test('resolve tribunal habilitado', () => {
    const result = resolveDataJudAlias(VALID_COURT);
    expect(result.ok).toBe(true);
    expect(result.alias).toBeDefined();
  });

  test('rejeita tribunal não habilitado', () => {
    const result = resolveDataJudAlias(INVALID_COURT);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('não habilitado');
  });

  test('retorna erro seguro sem chave e não chama fetch', async () => {
    const originalKey = process.env.DATAJUD_API_KEY;
    process.env.DATAJUD_API_KEY = '';

    const result = await queryDataJud({
      processNumber: VALID_CNJ,
      tribunalCode: VALID_COURT,
      timeoutMs: 25000,
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('Chave DataJud não configurada');
    expect(global.fetch).not.toHaveBeenCalled();

    process.env.DATAJUD_API_KEY = originalKey;
  });

  test('retorna erro 401 sem expor detalhes', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 401,
      ok: false,
      json: jest.fn(),
    });

    const result = await queryDataJud({
      processNumber: VALID_CNJ,
      tribunalCode: VALID_COURT,
      timeoutMs: 25000,
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('Autenticação');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBeTruthy();
  });

  test('retorna erro 403 sem expor detalhes', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 403,
      ok: false,
      json: jest.fn(),
    });

    const result = await queryDataJud({
      processNumber: VALID_CNJ,
      tribunalCode: VALID_COURT,
      timeoutMs: 25000,
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('Autenticação');
  });

  test('retorna rate_limited em 429', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 429,
      ok: false,
      json: jest.fn(),
    });

    const result = await queryDataJud({
      processNumber: VALID_CNJ,
      tribunalCode: VALID_COURT,
      timeoutMs: 25000,
    });

    expect(result.status).toBe('rate_limited');
    expect(result.error).toContain('Limite de requisições');
  });

  test('retorna erro genérico em 5xx', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 503,
      ok: false,
      json: jest.fn(),
    });

    const result = await queryDataJud({
      processNumber: VALID_CNJ,
      tribunalCode: VALID_COURT,
      timeoutMs: 25000,
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('temporariamente indisponível');
  });

  test('trata resposta malformada', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: jest.fn(() => Promise.reject(new Error('Invalid JSON'))),
    });

    const result = await queryDataJud({
      processNumber: VALID_CNJ,
      tribunalCode: VALID_COURT,
      timeoutMs: 25000,
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('Resposta inválida');
  });

  test('processo inexistente retorna not_found', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: jest.fn(() => Promise.resolve({
        hits: { hits: [] },
      })),
    });

    const result = await queryDataJud({
      processNumber: VALID_CNJ,
      tribunalCode: VALID_COURT,
      timeoutMs: 25000,
    });

    expect(result.status).toBe('not_found');
    expect(result.error).toContain('não localizado');
  });

  test('processo sigiloso retorna restricted', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: jest.fn(() => Promise.resolve({
        hits: {
          hits: [{
            _source: {
              sigilo: 'Sigiloso',
            },
          }],
        },
      })),
    });

    const result = await queryDataJud({
      processNumber: VALID_CNJ,
      tribunalCode: VALID_COURT,
      timeoutMs: 25000,
    });

    expect(result.status).toBe('restricted');
    expect(result.error).toContain('não disponíveis');
  });

  test('limita movimentações a 30 e ordena decrescente', async () => {
    const movements = Array.from({ length: 35 }, (_, i) => ({
      identificadorMovimento: `m-${i}`,
      dataHora: `2024-01-01T00:${(i).toString().padStart(2, '0')}:00Z`,
      nome: `Movimentação ${i}`,
    }));

    global.fetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: jest.fn(() => Promise.resolve({
        hits: {
          hits: [{
            _source: {
              tribunal: 'Tribunal de Justiça de São Paulo',
              classe: { nome: 'Ação Civil Pública' },
              assuntos: [{ nome: 'Dano Moral' }],
              dataAjuizamento: '2023-01-01T00:00:00Z',
              instancia: '1ª Instância',
              orgaoJulgador: { nome: 'Vara Cível' },
              movimentos: movements,
            },
          }],
        },
      })),
    });

    const result = await queryDataJud({
      processNumber: VALID_CNJ,
      tribunalCode: VALID_COURT,
      timeoutMs: 25000,
    });

    expect(result.status).toBe('success');
    expect(result.movements).toHaveLength(30);
    expect(result.movements[0].external_id).toBe('m-34');
  });

  test('não expõe alias, url, apiKey, headers ou endpoint no retorno', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: jest.fn(() => Promise.resolve({
        hits: {
          hits: [{
            _source: {
              tribunal: 'Tribunal de Justiça de São Paulo',
              movimentos: [],
            },
          }],
        },
      })),
    });

    const result = await queryDataJud({
      processNumber: VALID_CNJ,
      tribunalCode: VALID_COURT,
      timeoutMs: 25000,
    });

    expect(result).not.toHaveProperty('alias');
    expect(result).not.toHaveProperty('url');
    expect(result).not.toHaveProperty('apiUrl');
    expect(result).not.toHaveProperty('apiKey');
    expect(result).not.toHaveProperty('headers');
    expect(result).not.toHaveProperty('endpoint');
    expect(result).not.toHaveProperty('requestBody');
  });

  test('logs não contêm CNJ, alias, URL ou chave mockada', async () => {
    const consoleLogMock = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorMock = jest.spyOn(console, 'error').mockImplementation();

    global.fetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: jest.fn(() => Promise.resolve({
        hits: {
          hits: [{
            _source: {
              tribunal: 'Tribunal de Justiça de São Paulo',
              movimentos: [{ dataHora: '2024-01-01T00:00:00Z', nome: 'Sintético' }],
            },
          }],
        },
      })),
    });

    await queryDataJud({
      processNumber: VALID_CNJ,
      tribunalCode: VALID_COURT,
      timeoutMs: 25000,
    });

    const allLogs = [
      ...consoleLogMock.mock.calls.map(c => c.join(' ')),
      ...consoleErrorMock.mock.calls.map(c => c.join(' ')),
    ].join(' ');

    expect(allLogs).not.toContain(VALID_CNJ_NORMALIZED);
    expect(allLogs).not.toContain(VALID_CNJ);
    expect(allLogs).not.toContain('api_publica');
    expect(allLogs).not.toContain('MOCK-DATAJUD-KEY');
    expect(allLogs).not.toContain('api-publica.datajud');
    expect(allLogs).not.toContain('Sintético');

    consoleLogMock.mockRestore();
    consoleErrorMock.mockRestore();
  });
});
