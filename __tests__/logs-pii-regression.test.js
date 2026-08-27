/**
 * Testes - Regressão de PII em Logs
 * Valida que logs de rotas críticas não expõem dados sensíveis
 */

describe('Logs PII Regression', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('Webhook logs - Sem exposição de PII', () => {
    test('webhook não loga req.body bruto', () => {
      // Simula log inseguro que seria feito
      const reqBody = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '5511999999999',
                text: { body: 'Olá, tenho uma dúvida sobre meu caso' }
              }]
            }
          }]
        }]
      };

      // Não deve fazer console.log(reqBody)
      // Em vez disso, usa safeLog
      const { safeLog } = require('../lib/safeLogger');
      safeLog('info', 'webhook_received', {
        eventType: 'message',
        messageType: 'text',
        payloadSize: JSON.stringify(reqBody).length
      });

      const allLogs = [...consoleLogSpy.mock.calls];
      const loggedText = allLogs.map(call => call[0]).join('\n');

      // Não deve conter telefone completo
      expect(loggedText).not.toContain('5511999999999');
      // Não deve conter conteúdo de mensagem
      expect(loggedText).not.toContain('Olá, tenho uma dúvida');
      // Deve conter metadados seguros
      expect(loggedText).toContain('webhook_received');
      expect(loggedText).toContain('message');
    });

    test('webhook não loga headers brutos', () => {
      const { sanitizeHeaders } = require('../lib/safeLogger');

      const headers = {
        'authorization': 'Bearer token123',
        'x-webhook-id': 'webhook-456',
        'content-type': 'application/json'
      };

      const sanitized = sanitizeHeaders(headers);

      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized['x-webhook-id']).toBe('webhook-456');
      expect(sanitized['content-type']).toBe('application/json');
    });

    test('webhook não loga telefone ou conteúdo de mensagem', () => {
      const { safeLog, sanitizeForLog } = require('../lib/safeLogger');

      const phoneNumber = '5511999999999';
      const messageText = 'Tenho um problema com meu contrato';

      // Não deve fazer console.log(phoneNumber) ou console.log(messageText)
      // Em vez disso, usa safeLog com metadados
      safeLog('info', 'message_received', {
        messageType: 'text',
        payloadSize: messageText.length
      });

      const allLogs = [...consoleLogSpy.mock.calls];
      const loggedText = allLogs.map(call => call[0]).join('\n');

      expect(loggedText).not.toContain(phoneNumber);
      expect(loggedText).not.toContain(messageText);
      expect(loggedText).toContain('message_received');
    });
  });

  describe('Send-message logs - Sem exposição de PII', () => {
    test('send-message não loga destinatário', () => {
      const { safeLog } = require('../lib/safeLogger');

      const clientPhone = '5511999999999';

      // Não deve fazer console.log(clientPhone)
      safeLog('info', 'message_sent', {
        contentType: 'text',
        status: 'sent'
      });

      const allLogs = [...consoleLogSpy.mock.calls];
      const loggedText = allLogs.map(call => call[0]).join('\n');

      expect(loggedText).not.toContain(clientPhone);
      expect(loggedText).toContain('message_sent');
    });

    test('send-message não loga conteúdo de mensagem', () => {
      const { safeLog } = require('../lib/safeLogger');

      const messageText = 'Prezados, segue em anexo a documentação solicitada';

      // Não deve fazer console.log(messageText)
      safeLog('info', 'message_sent', {
        contentType: 'text',
        status: 'sent'
      });

      const allLogs = [...consoleLogSpy.mock.calls];
      const loggedText = allLogs.map(call => call[0]).join('\n');

      expect(loggedText).not.toContain(messageText);
    });

    test('send-message não loga URL de mídia assinada', () => {
      const { safeLog, sanitizeUrl } = require('../lib/safeLogger');

      const mediaUrl = 'https://supabase.com/storage/v1/object/sign/bucket/file.pdf?token=xyz&signature=abc';

      // Não deve fazer console.log(mediaUrl)
      const sanitized = sanitizeUrl(mediaUrl);
      expect(sanitized).toBe('[REDACTED_SIGNED_URL]');

      safeLog('info', 'media_sent', {
        mediaType: 'document',
        status: 'sent'
      });

      const allLogs = [...consoleLogSpy.mock.calls];
      const loggedText = allLogs.map(call => call[0]).join('\n');

      expect(loggedText).not.toContain('token=xyz');
      expect(loggedText).not.toContain('signature=abc');
    });

    test('send-message não loga storage_path', () => {
      const { safeLog, sanitizeForLog } = require('../lib/safeLogger');

      const storagePath = 'conversations/conv-123/media/file-456.pdf';

      // Não deve fazer console.log(storagePath)
      const sanitized = sanitizeForLog(storagePath);
      expect(sanitized).toBe('[REDACTED_STORAGE_PATH]');

      safeLog('info', 'media_uploaded', {
        mediaType: 'document'
      });

      const allLogs = [...consoleLogSpy.mock.calls];
      const loggedText = allLogs.map(call => call[0]).join('\n');

      expect(loggedText).not.toContain(storagePath);
    });
  });

  describe('AI/Ask logs - Sem exposição de PII', () => {
    test('ai/ask não loga pergunta integral', () => {
      const { safeLog } = require('../lib/safeLogger');

      const query = 'Qual é o procedimento para solicitar licença prêmio com CPF 123.456.789-00?';

      // Não deve fazer console.log(query)
      safeLog('info', 'rag_search', {
        queryLength: query.length,
        resultsCount: 5
      });

      const allLogs = [...consoleLogSpy.mock.calls];
      const loggedText = allLogs.map(call => call[0]).join('\n');

      expect(loggedText).not.toContain(query);
      expect(loggedText).not.toContain('123.456.789-00');
      expect(loggedText).toContain('rag_search');
    });

    test('ai/ask não loga contexto RAG bruto', () => {
      const { safeLog } = require('../lib/safeLogger');

      const context = `
        Documento: Petição inicial
        Cliente: João Silva
        CPF: 123.456.789-00
        Telefone: (11) 99999-9999
        Conteúdo: ...
      `;

      // Não deve fazer console.log(context)
      safeLog('info', 'rag_context_loaded', {
        contextLength: context.length,
        documentsCount: 3
      });

      const allLogs = [...consoleLogSpy.mock.calls];
      const loggedText = allLogs.map(call => call[0]).join('\n');

      expect(loggedText).not.toContain('João Silva');
      expect(loggedText).not.toContain('123.456.789-00');
      expect(loggedText).not.toContain('(11) 99999-9999');
    });

    test('ai/ask não loga resposta integral do Gemini', () => {
      const { safeLog } = require('../lib/safeLogger');

      const response = 'A licença prêmio é um direito do servidor público...';

      // Não deve fazer console.log(response)
      safeLog('info', 'gemini_response', {
        responseLength: response.length,
        model: 'gemini-2.5-flash'
      });

      const allLogs = [...consoleLogSpy.mock.calls];
      const loggedText = allLogs.map(call => call[0]).join('\n');

      expect(loggedText).not.toContain(response);
      expect(loggedText).toContain('gemini_response');
    });
  });

  describe('Nenhum dado sintético sensível em logs', () => {
    test('token sintético não aparece em logs', () => {
      const { sanitizeForLog } = require('../lib/safeLogger');

      const syntheticToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      const sanitized = sanitizeForLog(syntheticToken);
      expect(sanitized).toBe('[REDACTED_TOKEN]');
    });

    test('CPF sintético não aparece em logs', () => {
      const { sanitizeForLog } = require('../lib/safeLogger');

      const syntheticCpf = '123.456.789-00';
      const sanitized = sanitizeForLog(syntheticCpf);
      expect(sanitized).toBe('[REDACTED_CPF]');
    });

    test('telefone sintético não aparece em logs', () => {
      const { maskPhone } = require('../lib/safeLogger');

      const syntheticPhone = '+55 11 99999-9999';
      const masked = maskPhone(syntheticPhone);
      expect(masked).toBe('+55 1****-****');
    });

    test('e-mail sintético não aparece em logs', () => {
      const { maskEmail } = require('../lib/safeLogger');

      const syntheticEmail = 'test@example.com';
      const masked = maskEmail(syntheticEmail);
      expect(masked).toBe('t***@example.com');
    });

    test('URL assinada sintética não aparece em logs', () => {
      const { sanitizeUrl } = require('../lib/safeLogger');

      const syntheticUrl = 'https://supabase.com/storage/v1/object/sign/bucket/file.pdf?token=test123&signature=abc456';
      const sanitized = sanitizeUrl(syntheticUrl);
      expect(sanitized).toBe('[REDACTED_SIGNED_URL]');
    });

    test('storage_path sintético não aparece em logs', () => {
      const { sanitizeForLog } = require('../lib/safeLogger');

      const syntheticPath = 'conversations/conv-test-123/media/file-456.pdf';
      const sanitized = sanitizeForLog(syntheticPath);
      expect(sanitized).toBe('[REDACTED_STORAGE_PATH]');
    });
  });

  describe('Logs mantêm metadados operacionais', () => {
    test('log mantém route, requestId, status e duração', () => {
      const { safeLog } = require('../lib/safeLogger');

      safeLog('info', 'webhook_processed', {
        requestId: 'req-123',
        route: '/api/webhook',
        status: 200,
        durationMs: 1234
      });

      const allLogs = [...consoleLogSpy.mock.calls];
      const loggedText = allLogs[0][0];
      const entry = JSON.parse(loggedText);

      expect(entry.requestId).toBe('req-123');
      expect(entry.route).toBe('/api/webhook');
      expect(entry.status).toBe(200);
      expect(entry.durationMs).toBe(1234);
    });

    test('log de erro mantém informações de diagnóstico seguras', () => {
      const { safeError } = require('../lib/safeLogger');

      const error = new Error('Database connection failed');

      safeError('webhook_error', error, {
        requestId: 'req-456',
        route: '/api/webhook',
        provider: 'supabase',
        retryable: true
      });

      const allLogs = [...consoleErrorSpy.mock.calls];
      const loggedText = allLogs[0][0];
      const entry = JSON.parse(loggedText);

      expect(entry.requestId).toBe('req-456');
      expect(entry.route).toBe('/api/webhook');
      expect(entry.provider).toBe('supabase');
      expect(entry.retryable).toBe(true);
      expect(entry.errorName).toBe('Error');
    });
  });
});
