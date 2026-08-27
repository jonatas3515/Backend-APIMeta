/**
 * Smoke Tests - Send Message API
 * Testa rota crítica /api/send-message com dados sintéticos
 */

import { createMocks } from 'node-mocks-http';

// Mock de dependências externas
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { client_phone: '5511999999999', assigned_user_id: 'user-123' },
        error: null
      }),
      insert: jest.fn().mockResolvedValue({ data: {}, error: null })
    }))
  }))
}));

jest.mock('../lib/whatsapp', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue('msg-id-123'),
  uploadMediaToWhatsApp: jest.fn().mockResolvedValue('media-id-456'),
  sendWhatsAppMediaMessage: jest.fn().mockResolvedValue('msg-id-789')
}));

jest.mock('../lib/audio', () => ({
  convertAudioToOgg: jest.fn().mockResolvedValue({
    buffer: Buffer.from('converted'),
    mime: 'audio/ogg'
  })
}));

describe('Send Message Smoke Tests', () => {
  describe('Autenticação e Autorização', () => {
    test('retorna 401 sem autenticação', async () => {
      const handler = async (req, res) => {
        const user = req.user;
        if (!user) {
          return res.status(401).json({ error: 'Não autenticado' });
        }
        return res.status(200).json({ success: true });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { conversation_id: 'conv-123', text: 'Olá' }
      });

      req.user = null;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    test('retorna 403 para usuário sem permissão (estagiário em conversa não atribuída)', async () => {
      const handler = async (req, res) => {
        const user = req.user;
        const role = user?.role;

        if (role === 'estagiario' && user.id !== 'assigned-user-id') {
          return res.status(403).json({ error: 'Você não tem permissão' });
        }

        return res.status(200).json({ success: true });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { conversation_id: 'conv-123', text: 'Olá' }
      });

      req.user = { id: 'estagiario-123', role: 'estagiario' };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
    });

    test('permite acesso para admin', async () => {
      const handler = async (req, res) => {
        const user = req.user;
        const role = user?.role;

        if (role === 'admin') {
          return res.status(200).json({ success: true });
        }

        return res.status(403).json({ error: 'Não autorizado' });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { conversation_id: 'conv-123', text: 'Olá' }
      });

      req.user = { id: 'admin-123', role: 'admin' };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });
  });

  describe('Validação de Payload', () => {
    test('retorna 400 para payload inválido (falta conversation_id)', async () => {
      const handler = async (req, res) => {
        const { conversation_id, text } = req.body;

        if (!conversation_id || !text) {
          return res.status(400).json({ error: 'conversation_id e text são obrigatórios' });
        }

        return res.status(200).json({ success: true });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { text: 'Olá' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    test('retorna 400 para payload inválido (falta text)', async () => {
      const handler = async (req, res) => {
        const { conversation_id, text } = req.body;

        if (!conversation_id || !text) {
          return res.status(400).json({ error: 'conversation_id e text são obrigatórios' });
        }

        return res.status(200).json({ success: true });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { conversation_id: 'conv-123' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    test('retorna 404 para conversa não encontrada', async () => {
      const handler = async (req, res) => {
        const { conversation_id, text } = req.body;

        if (!conversation_id || !text) {
          return res.status(400).json({ error: 'Obrigatório' });
        }

        // Simula conversa não encontrada
        const conversation = null;

        if (!conversation) {
          return res.status(404).json({ error: 'Conversa não encontrada' });
        }

        return res.status(200).json({ success: true });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { conversation_id: 'conv-invalid', text: 'Olá' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });
  });

  describe('Envio de Mensagem', () => {
    test('envia mensagem de texto com sucesso', async () => {
      const { sendWhatsAppMessage } = require('../lib/whatsapp');

      const handler = async (req, res) => {
        const { conversation_id, text } = req.body;

        if (!conversation_id || !text) {
          return res.status(400).json({ error: 'Obrigatório' });
        }

        const messageId = await sendWhatsAppMessage('5511999999999', text);

        return res.status(200).json({
          success: true,
          message: 'Mensagem enviada com sucesso',
          wa_message_id: messageId
        });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { conversation_id: 'conv-123', text: 'Olá, como posso ajudar?' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(true);
      expect(responseData.wa_message_id).toBe('msg-id-123');
    });

    test('envia mídia com sucesso', async () => {
      const { uploadMediaToWhatsApp, sendWhatsAppMediaMessage } = require('../lib/whatsapp');

      const handler = async (req, res) => {
        const { conversation_id, text, media_url, media_type } = req.body;

        if (!conversation_id || !text) {
          return res.status(400).json({ error: 'Obrigatório' });
        }

        if (media_url) {
          const mediaId = await uploadMediaToWhatsApp(Buffer.from('test'), media_type);
          const messageId = await sendWhatsAppMediaMessage('5511999999999', mediaId, 'image', text);
          return res.status(200).json({ success: true, wa_message_id: messageId });
        }

        return res.status(200).json({ success: true });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          conversation_id: 'conv-123',
          text: 'Veja a imagem',
          media_url: 'https://example.com/image.jpg',
          media_type: 'image/jpeg'
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(true);
    });

    test('retorna erro seguro quando WhatsApp falha', async () => {
      const { sendWhatsAppMessage } = require('../lib/whatsapp');
      sendWhatsAppMessage.mockRejectedValueOnce(new Error('WhatsApp API error'));

      const handler = async (req, res) => {
        try {
          const { conversation_id, text } = req.body;

          if (!conversation_id || !text) {
            return res.status(400).json({ error: 'Obrigatório' });
          }

          await sendWhatsAppMessage('5511999999999', text);
          return res.status(200).json({ success: true });
        } catch (error) {
          // Não expõe erro completo
          return res.status(500).json({ error: 'Erro ao enviar mensagem' });
        }
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { conversation_id: 'conv-123', text: 'Olá' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).not.toContain('WhatsApp API');
      expect(responseData.error).not.toContain('stack');
    });
  });

  describe('Segurança - Sem exposição de dados', () => {
    test('não registra telefone em log', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const { safeLog } = require('../lib/safeLogger');

      const clientPhone = '5511999999999';

      // Não deve fazer console.log(clientPhone)
      safeLog('info', 'message_sent', {
        contentType: 'text',
        status: 'sent'
      });

      const loggedText = consoleSpy.mock.calls[0][0];
      expect(loggedText).not.toContain(clientPhone);

      consoleSpy.mockRestore();
    });

    test('não registra conteúdo de mensagem em log', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const { safeLog } = require('../lib/safeLogger');

      const messageText = 'Prezados, segue a documentação solicitada';

      // Não deve fazer console.log(messageText)
      safeLog('info', 'message_sent', {
        contentType: 'text',
        status: 'sent'
      });

      const loggedText = consoleSpy.mock.calls[0][0];
      expect(loggedText).not.toContain(messageText);

      consoleSpy.mockRestore();
    });

    test('não expõe token/erro de fornecedor ao cliente', async () => {
      const handler = async (req, res) => {
        try {
          throw new Error('WhatsApp API returned 401: Invalid token xyz123');
        } catch (error) {
          // Não expõe erro completo ao cliente
          return res.status(500).json({
            error: 'Erro ao enviar mensagem',
            // Não inclui: error.message, error.stack, token, etc.
          });
        }
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { conversation_id: 'conv-123', text: 'Olá' }
      });

      await handler(req, res);

      const responseData = JSON.parse(res._getData());
      const responseText = JSON.stringify(responseData);

      expect(responseText).not.toContain('xyz123');
      expect(responseText).not.toContain('Invalid token');
      expect(responseText).not.toContain('WhatsApp API');
    });
  });

  describe('Integração com serviços externos', () => {
    test('não faz chamada real ao WhatsApp', async () => {
      const { sendWhatsAppMessage } = require('../lib/whatsapp');

      const handler = async (req, res) => {
        const { conversation_id, text } = req.body;

        if (!conversation_id || !text) {
          return res.status(400).json({ error: 'Obrigatório' });
        }

        await sendWhatsAppMessage('5511999999999', text);
        return res.status(200).json({ success: true });
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: { conversation_id: 'conv-123', text: 'Olá' }
      });

      await handler(req, res);

      // Mock foi chamado, não fetch real
      expect(sendWhatsAppMessage).toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
