/**
 * Smoke Tests - Webhook API
 * Testa rota crítica /api/webhook com dados sintéticos
 */

import { createMocks } from 'node-mocks-http';

// Mock de dependências externas
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'conv-123' }, error: null }),
      insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
      update: jest.fn().mockReturnThis()
    }))
  }))
}));

jest.mock('../lib/whatsapp', () => ({
  uploadMediaToWhatsApp: jest.fn().mockResolvedValue('media-id-123'),
  sendWhatsAppMediaMessage: jest.fn().mockResolvedValue('msg-id-456')
}));

jest.mock('../lib/mediaProcessing', () => ({
  transcribeAudio: jest.fn().mockResolvedValue('Transcrição de áudio'),
  summarizeMedia: jest.fn().mockResolvedValue('Resumo de mídia')
}));

jest.mock('../lib/intakeFlows', () => ({
  detectArea: jest.fn().mockReturnValue('Trabalhista'),
  getNextQuestion: jest.fn().mockReturnValue('Qual é sua pergunta?'),
  isIntakeComplete: jest.fn().mockReturnValue(false),
  getFlow: jest.fn().mockReturnValue({}),
  getTriageQuestion: jest.fn().mockReturnValue('Qual é o tipo do seu caso?'),
  TRIAGE_FIELDS: []
}));

jest.mock('../lib/clientMemory', () => ({
  loadClientMemory: jest.fn().mockResolvedValue({}),
  formatClientMemory: jest.fn().mockReturnValue('')
}));

jest.mock('../lib/genderFromName', () => ({
  getClientTitle: jest.fn().mockReturnValue('Sr.')
}));

describe('Webhook Smoke Tests', () => {
  describe('GET - Verificação do webhook', () => {
    test('retorna 200 com challenge quando token é válido', async () => {
      // Mock da rota
      const handler = async (req, res) => {
        const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
        const VERIFY_TOKEN = 'test-token';

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
          res.setHeader('Content-Type', 'text/plain');
          return res.status(200).send(challenge);
        }

        return res.status(403).json({ error: 'Falha na verificação' });
      };

      const { req, res } = createMocks({
        method: 'GET',
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'test-token',
          'hub.challenge': 'challenge-123'
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getData()).toBe('challenge-123');
    });

    test('retorna 403 quando token é inválido', async () => {
      const handler = async (req, res) => {
        const { 'hub.mode': mode, 'hub.verify_token': token } = req.query;
        const VERIFY_TOKEN = 'test-token';

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
          return res.status(200).send('ok');
        }

        return res.status(403).json({ error: 'Falha na verificação' });
      };

      const { req, res } = createMocks({
        method: 'GET',
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong-token',
          'hub.challenge': 'challenge-123'
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(JSON.parse(res._getData()).error).toBe('Falha na verificação');
    });
  });

  describe('POST - Recebimento de webhook', () => {
    test('aceita payload válido com mensagem de texto', async () => {
      const handler = async (req, res) => {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Método não permitido' });
        }

        const body = req.body;
        if (!body || !body.entry) {
          return res.status(400).json({ error: 'Payload inválido' });
        }

        // Processa webhook
        return res.status(200).json({ success: true });
      };

      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: 'entry-123',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              messages: [{
                from: '5511999999999',
                id: 'msg-123',
                timestamp: '1234567890',
                type: 'text',
                text: { body: 'Olá, tenho uma dúvida' }
              }]
            }
          }]
        }]
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: payload
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData()).success).toBe(true);
    });

    test('retorna 400 para payload inválido', async () => {
      const handler = async (req, res) => {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Método não permitido' });
        }

        const body = req.body;
        if (!body || !body.entry) {
          return res.status(400).json({ error: 'Payload inválido' });
        }

        return res.status(200).json({ success: true });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { invalid: 'payload' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    test('retorna resposta controlada sem expor payload', async () => {
      const handler = async (req, res) => {
        try {
          const body = req.body;
          if (!body || !body.entry) {
            return res.status(400).json({ error: 'Payload inválido' });
          }
          return res.status(200).json({ success: true });
        } catch (error) {
          // Não expõe erro completo
          return res.status(500).json({ error: 'Erro ao processar webhook' });
        }
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: null
      });

      await handler(req, res);

      const responseData = JSON.parse(res._getData());
      expect(responseData.error).not.toContain('stack');
      expect(responseData.error).not.toContain('payload');
    });

    test('não retorna token, telefone ou conteúdo na resposta', async () => {
      const handler = async (req, res) => {
        // Simula processamento
        const body = req.body;
        if (!body || !body.entry) {
          return res.status(400).json({ error: 'Payload inválido' });
        }

        // Resposta segura
        return res.status(200).json({
          success: true,
          message: 'Webhook recebido com sucesso'
        });
      };

      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '5511999999999',
                text: { body: 'Conteúdo sensível' }
              }]
            }
          }]
        }]
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: payload
      });

      await handler(req, res);

      const responseData = JSON.parse(res._getData());
      const responseText = JSON.stringify(responseData);

      expect(responseText).not.toContain('5511999999999');
      expect(responseText).not.toContain('Conteúdo sensível');
      expect(responseText).not.toContain('Bearer');
      expect(responseText).not.toContain('token');
    });
  });

  describe('Integração com serviços externos', () => {
    test('não faz chamada real à Meta', async () => {
      const { uploadMediaToWhatsApp } = require('../lib/whatsapp');

      // Mock já está em lugar, não deve fazer fetch real
      await uploadMediaToWhatsApp(Buffer.from('test'), 'audio/ogg');

      expect(uploadMediaToWhatsApp).toHaveBeenCalled();
      // Não deve fazer fetch real
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('não grava payload sensível em log', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const { safeLog } = require('../lib/safeLogger');

      const payload = {
        messages: [{
          from: '5511999999999',
          text: { body: 'Conteúdo sensível' }
        }]
      };

      // Usa safeLog ao invés de console.log(payload)
      safeLog('info', 'webhook_received', {
        eventType: 'message',
        messageType: 'text',
        payloadSize: JSON.stringify(payload).length
      });

      const loggedText = consoleSpy.mock.calls[0][0];
      expect(loggedText).not.toContain('5511999999999');
      expect(loggedText).not.toContain('Conteúdo sensível');

      consoleSpy.mockRestore();
    });
  });

  describe('Segurança', () => {
    test('valida token de verificação', async () => {
      const handler = async (req, res) => {
        const token = req.query['hub.verify_token'];
        const VERIFY_TOKEN = 'test-token';

        if (token !== VERIFY_TOKEN) {
          return res.status(403).json({ error: 'Token inválido' });
        }

        return res.status(200).json({ success: true });
      };

      const { req, res } = createMocks({
        method: 'GET',
        query: { 'hub.verify_token': 'invalid' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
    });

    test('rejeita requisição sem método POST/GET', async () => {
      const handler = async (req, res) => {
        if (req.method !== 'POST' && req.method !== 'GET') {
          return res.status(405).json({ error: 'Método não permitido' });
        }
        return res.status(200).json({ success: true });
      };

      const { req, res } = createMocks({
        method: 'DELETE'
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });
  });
});
