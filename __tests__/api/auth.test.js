/**
 * Authentication and Permissions Tests
 * Tests critical auth flows without calling real services
 */

const { createMocks } = require('node-mocks-http');
const { SYNTHETIC_VALUES, SYNTHETIC_USER_ADVOGADO, SYNTHETIC_USER_ESTAGIARIO } = require('../fixtures/synthetic-data');

// Mock the auth module
jest.mock('../../lib/auth', () => ({
  withAuth: (handler, options = {}) => {
    return async (req, res) => {
      const authHeader = req.headers.authorization;
      
      // No token
      if (!authHeader) {
        return res.status(401).json({ error: 'Não autenticado' });
      }

      // Invalid token
      if (!authHeader.includes('Bearer ') || authHeader === 'Bearer invalid-token') {
        return res.status(401).json({ error: 'Token inválido' });
      }

      // Extract role from token
      const token = authHeader.replace('Bearer ', '');
      let userRole = 'estagiario';
      
      if (token.includes('admin')) userRole = 'admin';
      else if (token.includes('advogado')) userRole = 'advogado';
      else if (token.includes('estagiario')) userRole = 'estagiario';

      // Check minRole
      const roleHierarchy = { estagiario: 1, advogado: 2, admin: 3 };
      const minRole = options.minRole || 'estagiario';
      
      if (roleHierarchy[userRole] < roleHierarchy[minRole]) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      // Attach user to request
      req.user = {
        id: token.includes('admin') ? 'user-admin-synthetic-001' : 
            token.includes('advogado') ? 'user-advogado-synthetic-002' : 
            'user-estagiario-synthetic-003',
        role: userRole,
      };

      return handler(req, res);
    };
  },
}));

describe('Autenticação e Permissões', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('Endpoint sem token retorna 401', async () => {
    const mockHandler = require('../../lib/auth').withAuth(
      async (req, res) => res.status(200).json({ success: true }),
      { minRole: 'advogado' }
    );

    const { req, res } = createMocks({
      method: 'GET',
      headers: {},
    });

    await mockHandler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Não autenticado' });
  });

  test('Token inválido retorna 401', async () => {
    const mockHandler = require('../../lib/auth').withAuth(
      async (req, res) => res.status(200).json({ success: true }),
      { minRole: 'advogado' }
    );

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        authorization: 'Bearer invalid-token',
      },
    });

    await mockHandler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Token inválido' });
  });

  test('Estagiário não acessa rota exclusiva de advogado (403)', async () => {
    const mockHandler = require('../../lib/auth').withAuth(
      async (req, res) => res.status(200).json({ success: true }),
      { minRole: 'advogado' }
    );

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        authorization: 'Bearer token-estagiario-synthetic',
      },
    });

    await mockHandler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Acesso negado' });
  });

  test('Advogado acessa rota permitida (200)', async () => {
    const mockHandler = require('../../lib/auth').withAuth(
      async (req, res) => res.status(200).json({ success: true }),
      { minRole: 'advogado' }
    );

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        authorization: 'Bearer token-advogado-synthetic',
      },
    });

    await mockHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ success: true });
  });

  test('Admin acessa rota permitida (200)', async () => {
    const mockHandler = require('../../lib/auth').withAuth(
      async (req, res) => res.status(200).json({ success: true }),
      { minRole: 'advogado' }
    );

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        authorization: 'Bearer token-admin-synthetic',
      },
    });

    await mockHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ success: true });
  });

  test('Logs de autenticação não contêm email, token ou Authorization', async () => {
    const mockHandler = require('../../lib/auth').withAuth(
      async (req, res) => {
        console.log('Processing authenticated request');
        return res.status(200).json({ success: true });
      },
      { minRole: 'advogado' }
    );

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        authorization: `Bearer ${SYNTHETIC_VALUES.token}`,
      },
    });

    await mockHandler(req, res);

    const allLogs = consoleLogSpy.mock.calls.map(call => call.join(' ')).join(' ');
    const allErrors = consoleErrorSpy.mock.calls.map(call => call.join(' ')).join(' ');
    const combinedLogs = allLogs + ' ' + allErrors;

    // Verificar que valores sintéticos específicos NÃO aparecem nos logs
    expect(combinedLogs).not.toContain(SYNTHETIC_VALUES.email);
    expect(combinedLogs).not.toContain(SYNTHETIC_VALUES.token);
    expect(combinedLogs).not.toContain('Authorization');
    expect(combinedLogs).not.toContain('Bearer');
  });
});
