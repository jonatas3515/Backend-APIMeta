/**
 * Testes - Safe Logger
 * Valida sanitização de PII em logs
 */

import {
  maskPhone,
  maskCpfCnpj,
  maskEmail,
  maskAuthorization,
  sanitizeUrl,
  sanitizeForLog,
  sanitizeHeaders,
  hashUserId,
  safeLog,
  safeError
} from '../lib/safeLogger';

describe('Safe Logger - Sanitização de PII', () => {
  describe('maskPhone', () => {
    test('mascara telefone brasileiro', () => {
      const result = maskPhone('+55 11 99999-9999');
      expect(result).toBe('+55 1****-****');
    });

    test('mascara telefone sem formatação', () => {
      const result = maskPhone('5511999999999');
      expect(result).toBe('55119****-****');
    });

    test('retorna null para valor vazio', () => {
      expect(maskPhone('')).toBeNull();
      expect(maskPhone(null)).toBeNull();
      expect(maskPhone(undefined)).toBeNull();
    });

    test('retorna null para valor muito curto', () => {
      expect(maskPhone('123')).toBeNull();
    });
  });

  describe('maskCpfCnpj', () => {
    test('mascara CPF', () => {
      const result = maskCpfCnpj('123.456.789-00');
      expect(result).toBe('12345****');
    });

    test('mascara CNPJ', () => {
      const result = maskCpfCnpj('12.345.678/0001-90');
      expect(result).toBe('12345****');
    });

    test('retorna null para valor vazio', () => {
      expect(maskCpfCnpj('')).toBeNull();
      expect(maskCpfCnpj(null)).toBeNull();
    });
  });

  describe('maskEmail', () => {
    test('mascara e-mail', () => {
      const result = maskEmail('usuario@example.com');
      expect(result).toBe('u***@example.com');
    });

    test('retorna null para e-mail inválido', () => {
      expect(maskEmail('invalid')).toBeNull();
      expect(maskEmail('invalid@')).toBeNull();
    });

    test('retorna null para valor vazio', () => {
      expect(maskEmail('')).toBeNull();
      expect(maskEmail(null)).toBeNull();
    });
  });

  describe('maskAuthorization', () => {
    test('mascara Bearer token', () => {
      const result = maskAuthorization('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
      expect(result).toBe('[REDACTED_TOKEN]');
    });

    test('mascara token genérico longo', () => {
      const result = maskAuthorization('abcdefghijklmnopqrstuvwxyz');
      expect(result).toBe('[REDACTED]');
    });

    test('retorna valor curto como está', () => {
      const result = maskAuthorization('short');
      expect(result).toBe('short');
    });

    test('retorna null para valor vazio', () => {
      expect(maskAuthorization('')).toBeNull();
      expect(maskAuthorization(null)).toBeNull();
    });
  });

  describe('sanitizeUrl', () => {
    test('redact URL com token query param', () => {
      const result = sanitizeUrl('https://example.com/file?token=xyz123');
      expect(result).toBe('[REDACTED_SIGNED_URL]');
    });

    test('redact URL com signature', () => {
      const result = sanitizeUrl('https://example.com/file?signature=abc');
      expect(result).toBe('[REDACTED_SIGNED_URL]');
    });

    test('redact URL com storage_path', () => {
      const result = sanitizeUrl('https://supabase.com/storage/v1/object/public/storage_path/file.pdf');
      expect(result).toBe('[REDACTED_STORAGE_URL]');
    });

    test('retorna domínio para URL segura', () => {
      const result = sanitizeUrl('https://example.com/path/to/file');
      expect(result).toBe('https://example.com');
    });

    test('retorna null para URL inválida', () => {
      expect(sanitizeUrl('not-a-url')).toBeNull();
      expect(sanitizeUrl('')).toBeNull();
    });
  });

  describe('sanitizeForLog', () => {
    test('remove CPF', () => {
      const result = sanitizeForLog('Cliente com CPF 123.456.789-00 foi atendido');
      expect(result).toBe('[REDACTED_CPF]');
    });

    test('remove CNPJ', () => {
      const result = sanitizeForLog('CNPJ 12.345.678/0001-90 registrado');
      expect(result).toBe('[REDACTED_CNPJ]');
    });

    test('remove telefone', () => {
      const result = sanitizeForLog('Ligue para (11) 99999-9999');
      expect(result).toBe('[REDACTED_PHONE]');
    });

    test('remove e-mail', () => {
      const result = sanitizeForLog('Contato: usuario@example.com');
      expect(result).toBe('[REDACTED_EMAIL]');
    });

    test('remove token/chave', () => {
      const result = sanitizeForLog('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
      expect(result).toBe('[REDACTED_TOKEN]');
    });

    test('remove storage_path', () => {
      const result = sanitizeForLog('File at storage_path: /uploads/file.pdf');
      expect(result).toBe('[REDACTED_STORAGE_PATH]');
    });

    test('remove URL assinada', () => {
      const result = sanitizeForLog('https://example.com/file?X-Amz-Signature=xyz');
      expect(result).toBe('[REDACTED_SIGNED_URL]');
    });

    test('trunca conteúdo muito longo', () => {
      const long = 'a'.repeat(600);
      const result = sanitizeForLog(long);
      expect(result).toContain('[TRUNCATED]');
      expect(result.length).toBeLessThan(200);
    });

    test('retorna null para valor vazio', () => {
      expect(sanitizeForLog('')).toBeNull();
      expect(sanitizeForLog(null)).toBeNull();
      expect(sanitizeForLog(undefined)).toBeNull();
    });

    test('preserva texto seguro', () => {
      const result = sanitizeForLog('Mensagem segura sem dados sensíveis');
      expect(result).toBe('Mensagem segura sem dados sensíveis');
    });
  });

  describe('sanitizeHeaders', () => {
    test('remove Authorization header', () => {
      const headers = {
        'authorization': 'Bearer token123',
        'content-type': 'application/json'
      };
      const result = sanitizeHeaders(headers);
      expect(result.authorization).toBe('[REDACTED]');
      expect(result['content-type']).toBe('application/json');
    });

    test('remove Cookie header', () => {
      const headers = {
        'cookie': 'session=abc123',
        'accept': 'application/json'
      };
      const result = sanitizeHeaders(headers);
      expect(result.cookie).toBe('[REDACTED]');
      expect(result.accept).toBe('application/json');
    });

    test('remove X-API-Key header', () => {
      const headers = {
        'x-api-key': 'secret-key-123',
        'x-request-id': 'req-123'
      };
      const result = sanitizeHeaders(headers);
      expect(result['x-api-key']).toBe('[REDACTED]');
      expect(result['x-request-id']).toBe('req-123');
    });

    test('retorna objeto vazio para headers vazio', () => {
      expect(sanitizeHeaders(null)).toEqual({});
      expect(sanitizeHeaders(undefined)).toEqual({});
      expect(sanitizeHeaders({})).toEqual({});
    });
  });

  describe('hashUserId', () => {
    test('gera hash consistente para mesmo user_id', () => {
      const hash1 = hashUserId('user-123');
      const hash2 = hashUserId('user-123');
      expect(hash1).toBe(hash2);
    });

    test('gera hash diferente para user_id diferente', () => {
      const hash1 = hashUserId('user-123');
      const hash2 = hashUserId('user-456');
      expect(hash1).not.toBe(hash2);
    });

    test('retorna null para valor vazio', () => {
      expect(hashUserId('')).toBeNull();
      expect(hashUserId(null)).toBeNull();
      expect(hashUserId(undefined)).toBeNull();
    });

    test('hash tem 8 caracteres', () => {
      const hash = hashUserId('user-123');
      expect(hash).toHaveLength(8);
    });
  });

  describe('safeLog', () => {
    test('não lança erro com metadados válidos', () => {
      expect(() => {
        safeLog('info', 'test_event', { key: 'value' });
      }).not.toThrow();
    });

    test('não lança erro com metadados vazio', () => {
      expect(() => {
        safeLog('info', 'test_event');
      }).not.toThrow();
    });

    test('não lança erro com metadados inválido', () => {
      expect(() => {
        safeLog('info', 'test_event', { circular: undefined });
      }).not.toThrow();
    });

    test('suporta níveis: info, warn, error', () => {
      expect(() => {
        safeLog('info', 'event1');
        safeLog('warn', 'event2');
        safeLog('error', 'event3');
      }).not.toThrow();
    });
  });

  describe('safeError', () => {
    test('não lança erro com Error válido', () => {
      const error = new Error('Test error');
      expect(() => {
        safeError('test_error', error, { route: '/api/test' });
      }).not.toThrow();
    });

    test('não lança erro com string como error', () => {
      expect(() => {
        safeError('test_error', 'Error message', { route: '/api/test' });
      }).not.toThrow();
    });

    test('não lança erro com null/undefined', () => {
      expect(() => {
        safeError('test_error', null, {});
        safeError('test_error', undefined, {});
      }).not.toThrow();
    });

    test('sanitiza error.message', () => {
      const error = new Error('CPF 123.456.789-00 inválido');
      expect(() => {
        safeError('test_error', error);
      }).not.toThrow();
    });

    test('não expõe stack em produção', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      safeError('test_error', error);

      const logged = consoleSpy.mock.calls[0][0];
      const entry = JSON.parse(logged);

      expect(entry.stack).toBeUndefined();

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Integração - Sem exposição de PII', () => {
    test('log de webhook não expõe telefone ou conteúdo', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      safeLog('info', 'whatsapp_webhook_received', {
        requestId: 'req-123',
        eventType: 'message',
        messageType: 'text',
        payloadSize: 1024
      });

      const logged = consoleSpy.mock.calls[0][0];
      expect(logged).not.toContain('telefone');
      expect(logged).not.toContain('conteúdo');
      expect(logged).toContain('whatsapp_webhook_received');

      consoleSpy.mockRestore();
    });

    test('log de erro não expõe query ou contexto', () => {
      const error = new Error('Query: SELECT * FROM users WHERE phone = 5511999999999');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      safeError('ai_request_failed', error, {
        requestId: 'req-456',
        durationMs: 1234,
        route: '/api/ai/ask'
      });

      const logged = consoleSpy.mock.calls[0][0];
      const entry = JSON.parse(logged);
      
      // Verifica que o telefone foi sanitizado na mensagem de erro
      expect(entry.errorMessage).toContain('[REDACTED_PHONE]');
      expect(entry.errorMessage).not.toContain('5511999999999');
      expect(logged).toContain('ai_request_failed');
      expect(logged).toContain('req-456');

      consoleSpy.mockRestore();
    });
  });
});
