/**
 * Testes de acesso autorizado ao GET /api/cases
 * Garante que advogado/estagiário só veem casos a eles atribuídos
 */

const { createMocks } = require('node-mocks-http');

const db = {
  conversations: [
    { id: 'conv-1', assigned_user_id: 'user-advogado-synthetic' },
    { id: 'conv-2', assigned_user_id: 'user-admin-synthetic' },
    { id: 'conv-3', assigned_user_id: 'user-advogado-2' }
  ],
  cases: [
    {
      id: 'case-1',
      conversation_id: 'conv-1',
      status: 'em_analise',
      conversations: { assigned_user_id: 'user-advogado-synthetic' }
    },
    {
      id: 'case-2',
      conversation_id: 'conv-2',
      status: 'encerrado',
      conversations: { assigned_user_id: 'user-admin-synthetic' }
    },
    {
      id: 'case-3',
      conversation_id: 'conv-3',
      status: 'em_analise',
      conversations: { assigned_user_id: 'user-advogado-2' }
    }
  ]
};

function createBuilder(table) {
  const filters = [];
  let sortField = null;
  let sortAsc = true;

  const chain = {
    select: () => chain,
    eq: (field, value) => {
      filters.push({ field, value, op: 'eq' });
      return chain;
    },
    neq: (field, value) => {
      filters.push({ field, value, op: 'neq' });
      return chain;
    },
    not: (field, op, value) => {
      filters.push({ field, value, op: 'not_null' });
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    _getData: () => {
      let rows = [...(db[table] || [])];

      for (const f of filters) {
        rows = rows.filter(row => {
          let cell;
          if (f.field.includes('.')) {
            const [head, ...rest] = f.field.split('.');
            cell = row[head];
            for (const part of rest) cell = cell?.[part];
          } else {
            cell = row[f.field];
          }

          if (f.op === 'eq') return cell === f.value;
          if (f.op === 'neq') return cell !== f.value;
          if (f.op === 'not_null') return cell !== null && cell !== undefined;
          return true;
        });
      }

      return rows;
    },
    then: (resolve) => resolve({ data: chain._getData(), error: null }),
    maybeSingle: async () => {
      const rows = chain._getData();
      return { data: rows[0] || null, error: null };
    },
    single: async () => {
      const rows = chain._getData();
      return { data: rows[0] || null, error: rows[0] ? null : { message: 'Not found' } };
    }
  };

  return chain;
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table) => createBuilder(table))
  }))
}));

jest.mock('../lib/auth', () => ({
  withAuth: (handler) => async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    const users = {
      'admin-token': { id: 'user-admin-synthetic', role: 'admin' },
      'advogado-token': { id: 'user-advogado-synthetic', role: 'advogado' },
      'advogado-2-token': { id: 'user-advogado-2', role: 'advogado' },
      'estagiario-token': { id: 'user-estagiario-synthetic', role: 'estagiario' }
    };

    const user = users[token];
    if (!user) return res.status(401).json({ error: 'Token inválido' });
    req.user = user;
    return handler(req, res);
  }
}));

const casesHandler = require('../pages/api/cases').default;

describe('Cases - Acesso autorizado no GET', () => {
  test('admin acessa todos os casos', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: {},
      headers: { authorization: 'Bearer admin-token' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data).toHaveLength(3);
  });

  test('advogado vê apenas seus casos', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: {},
      headers: { authorization: 'Bearer advogado-token' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('case-1');
  });

  test('estagiário vê apenas seus casos', async () => {
    // No fixture de estagiário, portanto deve retornar vazio
    const { req, res } = createMocks({
      method: 'GET',
      query: {},
      headers: { authorization: 'Bearer estagiario-token' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data).toHaveLength(0);
  });

  test('caso de outro usuário retorna 403 sem indicar existência', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { id: 'case-3' },
      headers: { authorization: 'Bearer advogado-token' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const body = JSON.parse(res._getData());
    expect(body.error).toBe('Acesso não autorizado');
    expect(body).not.toHaveProperty('assigned_user_id');
    expect(body).not.toHaveProperty('case');
  });

  test('próprio caso é retornado com sucesso', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { id: 'case-1' },
      headers: { authorization: 'Bearer advogado-token' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.id).toBe('case-1');
  });

  test('conversation_id de conversa alheia retorna 403', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { conversation_id: 'conv-3' },
      headers: { authorization: 'Bearer advogado-token' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const body = JSON.parse(res._getData());
    expect(body.error).toBe('Acesso não autorizado');
  });

  test('conversation_id própria retorna casos relacionados', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { conversation_id: 'conv-1' },
      headers: { authorization: 'Bearer advogado-token' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('case-1');
  });

  test('conversation_id inexistente retorna 404 genérico', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { conversation_id: 'conv-inexistente' },
      headers: { authorization: 'Bearer advogado-token' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(404);
    const body = JSON.parse(res._getData());
    expect(body.error).toBe('Conversa não encontrada');
  });
});
