/**
 * Testes de Segurança - Notificações
 * Garante que nenhuma PII é exposta em títulos ou prévias
 */

import {
  sanitizeNotificationTitle,
  validateNoPII,
  formatRelativeDate
} from '../lib/notificationHelpers';

describe('Notification Security', () => {
  describe('sanitizeNotificationTitle', () => {
    test('message notification has no client name', () => {
      const item = {
        client_name: 'João Silva',
        client_phone: '(11) 98765-4321',
        legal_area: 'Trabalhista'
      };

      const title = sanitizeNotificationTitle(item, 'message');

      expect(title).toBe('Nova mensagem');
      expect(title).not.toContain('João');
      expect(title).not.toContain('Silva');
      expect(title).not.toContain('98765');
    });

    test('deadline notification has no client name', () => {
      const item = {
        client_name: 'Maria Santos',
        legal_area: 'Previdenciário',
        municipality: 'São Paulo'
      };

      const title = sanitizeNotificationTitle(item, 'deadline');

      expect(title).toContain('Previdenciário');
      expect(title).toContain('São Paulo');
      expect(title).not.toContain('Maria');
      expect(title).not.toContain('Santos');
    });

    test('signature notification has no document path', () => {
      const item = {
        document_name: 'Contrato - João Silva.pdf',
        storage_path: '/signatures/secret-path/file.pdf',
        url: 'https://example.com/sign/abc123'
      };

      const title = sanitizeNotificationTitle(item, 'signature');

      expect(title).toBe('Assinatura pendente');
      expect(title).not.toContain('secret-path');
      expect(title).not.toContain('http');
      expect(title).not.toContain('João');
    });

    test('process movement has no process number', () => {
      const item = {
        process_number: '0001234-56.2024.5.01.0001',
        legal_area: 'Trabalhista'
      };

      const title = sanitizeNotificationTitle(item, 'process_movement');

      expect(title).toBe('Nova movimentação processual');
      expect(title).not.toContain('0001234');
      expect(title).not.toContain('2024');
    });
  });

  describe('validateNoPII', () => {
    test('detects CPF in title', () => {
      const title = 'Caso de 123.456.789-00';
      expect(validateNoPII(title)).toBe(false);
    });

    test('detects phone in title', () => {
      const title = 'Contato: (11) 98765-4321';
      expect(validateNoPII(title)).toBe(false);
    });

    test('detects email in title', () => {
      const title = 'Enviar para joao@example.com';
      expect(validateNoPII(title)).toBe(false);
    });

    test('detects URL in title', () => {
      const title = 'Acesse https://example.com/secret';
      expect(validateNoPII(title)).toBe(false);
    });

    test('detects full name in title', () => {
      const title = 'João Silva enviou mensagem';
      expect(validateNoPII(title)).toBe(false);
    });

    test('allows safe titles', () => {
      const safeTitles = [
        'Nova mensagem',
        'Prazo de caso Trabalhista',
        'Lembrete pendente',
        'Caso Previdenciário - São Paulo',
        'Evento hoje - Cível'
      ];

      safeTitles.forEach(title => {
        expect(validateNoPII(title)).toBe(true);
      });
    });
  });

  describe('formatRelativeDate', () => {
    test('does not expose exact timestamps', () => {
      const date = new Date('2024-01-15T14:30:00');
      const formatted = formatRelativeDate(date, 'past');

      // Não deve conter hora exata
      expect(formatted).not.toContain('14:30');
      expect(formatted).not.toContain('14h30');
    });

    test('uses relative format for recent dates', () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const formatted = formatRelativeDate(twoHoursAgo, 'past');

      expect(formatted).toMatch(/há \d+h/);
    });
  });

  describe('Edge cases', () => {
    test('handles null/undefined items safely', () => {
      expect(() => sanitizeNotificationTitle(null, 'message')).not.toThrow();
      expect(() => sanitizeNotificationTitle(undefined, 'message')).not.toThrow();
      expect(() => sanitizeNotificationTitle({}, 'message')).not.toThrow();
    });

    test('handles missing legal_area', () => {
      const item = { municipality: 'São Paulo' };
      const title = sanitizeNotificationTitle(item, 'deadline');

      expect(title).toContain('jurídico');
      expect(title).toContain('São Paulo');
    });

    test('handles missing municipality', () => {
      const item = { legal_area: 'Trabalhista' };
      const title = sanitizeNotificationTitle(item, 'deadline');

      expect(title).toContain('Trabalhista');
      expect(title).not.toContain('undefined');
    });
  });
});
