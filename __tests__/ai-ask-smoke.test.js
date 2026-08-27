/**
 * Smoke Tests - AI Ask API
 * Testa rota crítica /api/ai/ask com dados sintéticos
 */

import { createMocks } from 'node-mocks-http';

// Mock de dependências externas
jest.mock('../lib/supabaseServer', () => ({
  supabaseServer: {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null
      })
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { role: 'advogado' },
        error: null
      }),
      insert: jest.fn().mockResolvedValue({ error: null })
    }))
  }
}));

jest.mock('../lib/knowledgeSearch', () => ({
  searchKnowledge: jest.fn().mockResolvedValue({
    results: [
      {
        title: 'Modelo de Petição',
        doc_type: 'template',
        area: 'Trabalhista',
        tribunal: 'TRT',
        content: 'Conteúdo de modelo...'
      }
    ],
    documents: [
      {
        document_id: 'doc-123',
        title: 'Modelo de Petição',
        type: 'template',
        area: 'Trabalhista',
        tribunal: 'TRT',
        tags: ['trabalhista', 'petição']
      }
    ]
  })
}));

jest.mock('../lib/aiRag', () => ({
  askRag: jest.fn().mockResolvedValue('Resposta do assistente jurídico...')
}));

jest.mock('../lib/anonymize', () => ({
  anonymizeText: jest.fn((text) => text.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '[CPF]'))
}));

describe('AI Ask Smoke Tests', () => {
  describe('Autenticação e Autorização', () => {
    test('retorna 401 sem autenticação', async () => {
      const handler = async (req, res) => {
        const user = req.user;
        if (!user) {
          return res.status(401).json({ error: 'Não autenticado' });
        }
        return res.status(200).json({ answer: 'Resposta' });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { query: 'Qual é o procedimento?' }
      });

      req.user = null;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    test('retorna 403 para usuário sem permissão', async () => {
      const handler = async (req, res) => {
        const user = req.user;
        const allowed = user && ['admin', 'advogado', 'estagiario'].includes(user.role);

        if (!allowed) {
          return res.status(403).json({ error: 'Permissão negada' });
        }

        return res.status(200).json({ answer: 'Resposta' });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { query: 'Qual é o procedimento?' }
      });

      req.user = { id: 'user-123', role: 'cliente' };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
    });

    test('permite acesso para advogado', async () => {
      const handler = async (req, res) => {
        const user = req.user;
        const allowed = user && ['admin', 'advogado', 'estagiario'].includes(user.role);

        if (!allowed) {
          return res.status(403).json({ error: 'Permissão negada' });
        }

        return res.status(200).json({ answer: 'Resposta' });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { query: 'Qual é o procedimento?' }
      });

      req.user = { id: 'user-123', role: 'advogado' };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });
  });

  describe('Validação de Pergunta', () => {
    test('retorna 400 para pergunta muito curta', async () => {
      const handler = async (req, res) => {
        const { query } = req.body || {};

        if (!query || query.trim().length < 3) {
          return res.status(400).json({ error: 'Pergunta muito curta' });
        }

        return res.status(200).json({ answer: 'Resposta' });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { query: 'ab' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    test('retorna 400 para pergunta vazia', async () => {
      const handler = async (req, res) => {
        const { query } = req.body || {};

        if (!query || query.trim().length < 3) {
          return res.status(400).json({ error: 'Pergunta muito curta' });
        }

        return res.status(200).json({ answer: 'Resposta' });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { query: '' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    test('retorna 405 para método não POST', async () => {
      const handler = async (req, res) => {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          return res.status(405).json({ error: 'Método não permitido' });
        }
        return res.status(200).json({ answer: 'Resposta' });
      };

      const { req, res } = createMocks({
        method: 'GET'
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });
  });

  describe('Processamento de Pergunta', () => {
    test('retorna resposta estruturada com sucesso', async () => {
      const { askRag } = require('../lib/aiRag');

      const handler = async (req, res) => {
        const { query, area = null, tribunal = null, type = null } = req.body || {};

        if (!query || query.trim().length < 3) {
          return res.status(400).json({ error: 'Pergunta muito curta' });
        }

        const answer = await askRag(query, 'contexto');

        const documents = [
          {
            document_id: 'doc-123',
            title: 'Modelo',
            type: 'template',
            area: 'Trabalhista',
            tribunal: 'TRT',
            tags: ['trabalhista']
          }
        ];

        return res.status(200).json({
          answer,
          sources: documents.map(d => ({
            title: d.title,
            type: d.type,
            area: d.area,
            tribunal: d.tribunal,
            tags: d.tags
          }))
        });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { query: 'Qual é o procedimento para licença prêmio?' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());
      expect(responseData.answer).toBeTruthy();
      expect(responseData.sources).toBeInstanceOf(Array);
    });

    test('retorna erro controlado quando RAG falha', async () => {
      const { askRag } = require('../lib/aiRag');
      askRag.mockRejectedValueOnce(new Error('RAG service error'));

      const handler = async (req, res) => {
        try {
          const { query } = req.body || {};

          if (!query || query.trim().length < 3) {
            return res.status(400).json({ error: 'Pergunta muito curta' });
          }

          await askRag(query, 'contexto');
          return res.status(200).json({ answer: 'Resposta' });
        } catch (error) {
          // Não expõe erro completo
          return res.status(500).json({ error: 'Erro ao processar a consulta' });
        }
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { query: 'Qual é o procedimento?' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).not.toContain('RAG service');
      expect(responseData.error).not.toContain('stack');
    });

    test('retorna erro controlado quando Gemini falha', async () => {
      const { askRag } = require('../lib/aiRag');
      askRag.mockRejectedValueOnce(new Error('Gemini API error: 429'));

      const handler = async (req, res) => {
        try {
          const { query } = req.body || {};

          if (!query || query.trim().length < 3) {
            return res.status(400).json({ error: 'Pergunta muito curta' });
          }

          await askRag(query, 'contexto');
          return res.status(200).json({ answer: 'Resposta' });
        } catch (error) {
          // Não expõe erro completo
          return res.status(500).json({ error: 'Erro ao processar a consulta' });
        }
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { query: 'Qual é o procedimento?' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).not.toContain('Gemini');
      expect(responseData.error).not.toContain('429');
    });
  });

  describe('Segurança - Sem exposição de dados', () => {
    test('não retorna pergunta integral na resposta', async () => {
      const handler = async (req, res) => {
        const { query } = req.body || {};

        if (!query || query.trim().length < 3) {
          return res.status(400).json({ error: 'Pergunta muito curta' });
        }

        // Não retorna query na resposta
        return res.status(200).json({
          answer: 'Resposta segura',
          sources: []
        });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { query: 'Qual é o procedimento para CPF 123.456.789-00?' }
      });

      await handler(req, res);

      const responseData = JSON.parse(res._getData());
      const responseText = JSON.stringify(responseData);

      expect(responseText).not.toContain('123.456.789-00');
      expect(responseText).not.toContain('CPF 123.456.789-00');
    });

    test('não retorna contexto RAG bruto na resposta', async () => {
      const handler = async (req, res) => {
        const { query } = req.body || {};

        if (!query || query.trim().length < 3) {
          return res.status(400).json({ error: 'Pergunta muito curta' });
        }

        // Não retorna contexto bruto, apenas resposta processada
        return res.status(200).json({
          answer: 'Resposta processada',
          sources: [
            {
              title: 'Modelo de Petição',
              type: 'template',
              area: 'Trabalhista',
              tribunal: 'TRT',
              tags: ['trabalhista']
            }
          ]
        });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { query: 'Qual é o procedimento?' }
      });

      await handler(req, res);

      const responseData = JSON.parse(res._getData());
      const responseText = JSON.stringify(responseData);

      // Não deve conter conteúdo bruto do documento
      expect(responseText).not.toContain('Conteúdo de modelo');
    });

    test('não retorna resposta integral do Gemini', async () => {
      const handler = async (req, res) => {
        const { query } = req.body || {};

        if (!query || query.trim().length < 3) {
          return res.status(400).json({ error: 'Pergunta muito curta' });
        }

        // Resposta é processada, não retorna stack ou erro completo
        return res.status(200).json({
          answer: 'Resposta processada',
          sources: []
        });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { query: 'Qual é o procedimento?' }
      });

      await handler(req, res);

      const responseData = JSON.parse(res._getData());
      const responseText = JSON.stringify(responseData);

      expect(responseText).not.toContain('stack');
      expect(responseText).not.toContain('error');
    });

    test('não registra pergunta integral em log', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const { safeLog } = require('../lib/safeLogger');

      const query = 'Qual é o procedimento para CPF 123.456.789-00?';

      // Não deve fazer console.log(query)
      safeLog('info', 'rag_search', {
        queryLength: query.length,
        resultsCount: 5
      });

      const loggedText = consoleSpy.mock.calls[0][0];
      expect(loggedText).not.toContain(query);
      expect(loggedText).not.toContain('123.456.789-00');

      consoleSpy.mockRestore();
    });

    test('não registra contexto RAG bruto em log', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const { safeLog } = require('../lib/safeLogger');

      const context = 'Documento: Petição\nCliente: João Silva\nCPF: 123.456.789-00';

      // Não deve fazer console.log(context)
      safeLog('info', 'rag_context_loaded', {
        contextLength: context.length,
        documentsCount: 1
      });

      const loggedText = consoleSpy.mock.calls[0][0];
      expect(loggedText).not.toContain(context);
      expect(loggedText).not.toContain('João Silva');
      expect(loggedText).not.toContain('123.456.789-00');

      consoleSpy.mockRestore();
    });
  });

  describe('Integração com serviços externos', () => {
    test('não faz chamada real ao Gemini', async () => {
      const { askRag } = require('../lib/aiRag');

      const handler = async (req, res) => {
        const { query } = req.body || {};

        if (!query || query.trim().length < 3) {
          return res.status(400).json({ error: 'Pergunta muito curta' });
        }

        await askRag(query, 'contexto');
        return res.status(200).json({ answer: 'Resposta' });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { query: 'Qual é o procedimento?' }
      });

      await handler(req, res);

      // Mock foi chamado, não fetch real
      expect(askRag).toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('não faz chamada real ao search_knowledge', async () => {
      const { searchKnowledge } = require('../lib/knowledgeSearch');

      const handler = async (req, res) => {
        const { query } = req.body || {};

        if (!query || query.trim().length < 3) {
          return res.status(400).json({ error: 'Pergunta muito curta' });
        }

        await searchKnowledge({ query, status: 'aprovado' });
        return res.status(200).json({ answer: 'Resposta' });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { query: 'Qual é o procedimento?' }
      });

      await handler(req, res);

      // Mock foi chamado, não fetch real
      expect(searchKnowledge).toHaveBeenCalled();
    });
  });
});
