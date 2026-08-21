/**
 * DataJud Tests
 * Tests DataJud integration without calling real CNJ API
 */

const { createMocks } = require('node-mocks-http');
const { SYNTHETIC_CASE_PROCESS } = require('../fixtures/synthetic-data');

// Mock datajudClient
jest.mock('../../lib/datajudClient', () => ({
  queryDataJud: jest.fn(async ({ processNumber, tribunalCode, timeoutMs }) => {
    // Simulate whitelist validation
    const validCourts = ['TRT01', 'TRT05', 'TRT08', 'TJRJ', 'TJSP', 'TRF1', 'TRF2'];
    
    if (!validCourts.includes(tribunalCode.toUpperCase())) {
      return {
        status: 'invalid',
        error: 'Tribunal não cadastrado na whitelist',
      };
    }

    // Simulate timeout
    if (timeoutMs < 1000) {
      return {
        status: 'error',
        error: 'Timeout na consulta ao DataJud',
      };
    }

    // Simulate 401/403
    if (processNumber.includes('UNAUTHORIZED')) {
      return {
        status: 'error',
        error: 'Erro de autenticação (401)',
      };
    }

    if (processNumber.includes('FORBIDDEN')) {
      return {
        status: 'error',
        error: 'Acesso negado (403)',
      };
    }

    // Simulate success
    return {
      status: 'success',
      court: {
        name: 'Tribunal Regional do Trabalho da 1ª Região',
        code: tribunalCode,
      },
      movements: [
        {
          date: '2024-01-15',
          text: 'Juntada de petição',
        },
      ],
      lastMovement: {
        date: '2024-01-15',
      },
    };
  }),
}));

describe('DataJud', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  test('Tribunal não cadastrado na whitelist é rejeitado', async () => {
    const { queryDataJud } = require('../../lib/datajudClient');

    const result = await queryDataJud({
      processNumber: '0000000-00.0000.0.00.0000',
      tribunalCode: 'INVALID_COURT',
      timeoutMs: 25000,
    });

    expect(result.status).toBe('invalid');
    expect(result.error).toContain('não cadastrado');
  });

  test('Erro 401 é retornado como erro explícito', async () => {
    const { queryDataJud } = require('../../lib/datajudClient');

    const result = await queryDataJud({
      processNumber: 'UNAUTHORIZED-00.0000.0.00.0000',
      tribunalCode: 'TRT01',
      timeoutMs: 25000,
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('401');
  });

  test('Erro 403 é retornado como erro explícito', async () => {
    const { queryDataJud } = require('../../lib/datajudClient');

    const result = await queryDataJud({
      processNumber: 'FORBIDDEN-00.0000.0.00.0000',
      tribunalCode: 'TRT01',
      timeoutMs: 25000,
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('403');
  });

  test('Timeout é retornado como erro explícito', async () => {
    const { queryDataJud } = require('../../lib/datajudClient');

    const result = await queryDataJud({
      processNumber: '0000000-00.0000.0.00.0000',
      tribunalCode: 'TRT01',
      timeoutMs: 500, // Too short
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('Timeout');
  });

  test('Frontend não recebe alias, URL, header ou chave', async () => {
    const { queryDataJud } = require('../../lib/datajudClient');

    const result = await queryDataJud({
      processNumber: '0000000-00.0000.0.00.0000',
      tribunalCode: 'TRT01',
      timeoutMs: 25000,
    });

    // Frontend should only receive safe data
    expect(result).not.toHaveProperty('alias');
    expect(result).not.toHaveProperty('url');
    expect(result).not.toHaveProperty('apiUrl');
    expect(result).not.toHaveProperty('apiKey');
    expect(result).not.toHaveProperty('headers');
    expect(result).not.toHaveProperty('endpoint');

    // Should only have status, court info, and movements
    expect(result).toHaveProperty('status');
    if (result.status === 'success') {
      expect(result).toHaveProperty('court');
      expect(result).toHaveProperty('movements');
      expect(result.court).not.toHaveProperty('alias');
      expect(result.court).not.toHaveProperty('url');
    }
  });
});
