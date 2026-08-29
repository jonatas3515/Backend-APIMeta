/**
 * Testes de integração do roteador com Agenda.
 * Verifica que URLs de prazo, lembrete e evento são construídas e resolvidas de forma segura.
 */

const { buildInternalUrl, resolveLegacyQuery } = require('../lib/router');

describe('Agenda - integração com roteador', () => {
  test('buildInternalUrl cria rota segura para prazo com caseId e reminderId', () => {
    const url = buildInternalUrl({ tab: 'cases', caseId: 'case-synthetic-001', reminderId: 'reminder-synthetic-001' });
    expect(url).toBe('/?tab=cases&caseId=case-synthetic-001&reminderId=reminder-synthetic-001');
  });

  test('buildInternalUrl cria rota segura para lembrete de conversa', () => {
    const url = buildInternalUrl({ tab: 'chat', conversationId: 'conv-synthetic-001', reminderId: 'reminder-synthetic-001' });
    expect(url).toBe('/?tab=chat&conversationId=conv-synthetic-001&reminderId=reminder-synthetic-001');
  });

  test('buildInternalUrl cria rota segura para evento de agenda', () => {
    const url = buildInternalUrl({ tab: 'agenda', eventId: 'event-synthetic-001', reminderId: 'reminder-synthetic-001' });
    expect(url).toBe('/?tab=agenda&eventId=event-synthetic-001&reminderId=reminder-synthetic-001');
  });

  test('resolveLegacyQuery normaliza eventId legado para aba agenda', () => {
    const result = resolveLegacyQuery({ eventId: 'event-synthetic-001', reminderId: 'reminder-synthetic-001' });
    expect(result.tab).toBe('agenda');
    expect(result.eventId).toBe('event-synthetic-001');
    expect(result.reminderId).toBe('reminder-synthetic-001');
  });

  test('URLs de agenda não incluem parâmetros perigosos', () => {
    const url = buildInternalUrl({ tab: 'agenda', eventId: 'event-synthetic-001', reminderId: 'reminder-synthetic-001' });
    expect(url).not.toContain('http:');
    expect(url).not.toContain('https:');
    expect(url).not.toContain('javascript:');
    expect(url).not.toContain('token=');
    expect(url).not.toContain('storage_path=');
  });
});
