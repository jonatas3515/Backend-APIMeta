const { createMocks } = require('node-mocks-http');

jest.mock('@/lib/auth', () => ({
  withAuth: (handler) => handler,
  supabaseAdmin: {
    from: jest.fn()
  }
}));

const { supabaseAdmin } = require('@/lib/auth');
const planosHandler = require('@/pages/api/admin/planos').default;
const cuponsHandler = require('@/pages/api/admin/cupons').default;
const mensagensHandler = require('@/pages/api/admin/mensagens').default;
const pagamentosHandler = require('@/pages/api/admin/pagamentos').default;
const modelosHandler = require('@/pages/api/admin/modelos').default;

describe('Admin Modules Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/admin/planos', () => {
    it('retorna lista de planos cadastrados', async () => {
      supabaseAdmin.from.mockImplementation((table) => {
        if (table === 'planos') {
          return {
            select: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: [{ id: 'p-1', nome: 'Básico', preco_mensal: 49 }],
                error: null
              })
            })
          };
        }
      });

      const { req, res } = createMocks({ method: 'GET' });
      await planosHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.planos).toHaveLength(1);
      expect(data.planos[0].nome).toBe('Básico');
    });
  });

  describe('POST /api/admin/cupons', () => {
    it('cria cupom com código em maiúsculas', async () => {
      supabaseAdmin.from.mockImplementation((table) => {
        if (table === 'cupons_desconto') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'c-1', codigo: 'PROMO20', valor_desconto: 20 },
                  error: null
                })
              })
            })
          };
        }
      });

      const { req, res } = createMocks({
        method: 'POST',
        body: { codigo: 'promo20', valor_desconto: 20 }
      });
      await cuponsHandler(req, res);

      expect(res._getStatusCode()).toBe(201);
      const data = JSON.parse(res._getData());
      expect(data.cupom.codigo).toBe('PROMO20');
    });
  });

  describe('POST /api/admin/mensagens', () => {
    it('envia mensagem para escritório específico', async () => {
      supabaseAdmin.from.mockImplementation((table) => {
        if (table === 'mensagens_admin') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'm-1', assunto: 'Aviso', mensagem: 'Mensagem teste' },
                  error: null
                })
              })
            })
          };
        }
      });

      const { req, res } = createMocks({
        method: 'POST',
        body: { escritorio_id: 'off-1', assunto: 'Aviso', mensagem: 'Mensagem teste' }
      });
      await mensagensHandler(req, res);

      expect(res._getStatusCode()).toBe(201);
      const data = JSON.parse(res._getData());
      expect(data.mensagem.assunto).toBe('Aviso');
    });
  });

  describe('GET /api/admin/pagamentos', () => {
    it('retorna pagamentos enriquecidos com nome do escritório', async () => {
      supabaseAdmin.from.mockImplementation((table) => {
        if (table === 'pagamentos') {
          return {
            select: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: [{ id: 'pay-1', escritorio_id: 'off-1', valor: 99, status: 'aprovado' }],
                error: null
              })
            })
          };
        }
        if (table === 'offices') {
          return {
            select: jest.fn().mockResolvedValue({
              data: [{ id: 'off-1', name: 'Escritório Modelo' }],
              error: null
            })
          };
        }
      });

      const { req, res } = createMocks({ method: 'GET' });
      await pagamentosHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.pagamentos).toHaveLength(1);
      expect(data.pagamentos[0].escritorio_nome).toBe('Escritório Modelo');
    });
  });

  describe('GET /api/admin/modelos', () => {
    it('retorna modelos de documentos', async () => {
      supabaseAdmin.from.mockImplementation((table) => {
        if (table === 'modelos_documentos') {
          return {
            select: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: [{ id: 'mod-1', nome: 'Procuração', area: 'civel' }],
                error: null
              })
            })
          };
        }
      });

      const { req, res } = createMocks({ method: 'GET' });
      await modelosHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.modelos).toHaveLength(1);
      expect(data.modelos[0].nome).toBe('Procuração');
    });
  });
});
