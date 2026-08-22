/**
 * Testes sintéticos para resolução de URLs de Colaboração/Insights dentro de Casos.
 * Não usam dados reais nem chamadas de rede.
 */

const { resolveCaseView } = require('../lib/caseView');

describe('resolveCaseView - compatibilidade de URLs', () => {
  test('?tab=collaboration sem caseId abre Casos com aviso', () => {
    const result = resolveCaseView({ tab: 'collaboration' });

    expect(result.activeTab).toBe('cases');
    expect(result.caseId).toBeNull();
    expect(result.caseView).toBe('list');
    expect(result.redirectUrl).toBe('/?tab=cases');
    expect(result.notice).toBe('Selecione um caso para acessar a colaboração.');
  });

  test('?tab=collaboration&caseId=<id> abre caso na aba Colaboração', () => {
    const result = resolveCaseView({ tab: 'collaboration', caseId: 'case-123' });

    expect(result.activeTab).toBe('cases');
    expect(result.caseId).toBe('case-123');
    expect(result.caseView).toBe('colaboracao');
    expect(result.redirectUrl).toBe('/?tab=cases&caseId=case-123&caseView=colaboracao');
    expect(result.notice).toBeNull();
  });

  test('?tab=insights abre visão global de Insights', () => {
    const result = resolveCaseView({ tab: 'insights' });

    expect(result.activeTab).toBe('cases');
    expect(result.caseId).toBeNull();
    expect(result.caseView).toBe('insights');
    expect(result.redirectUrl).toBe('/?tab=cases&caseView=insights');
    expect(result.notice).toBeNull();
  });

  test('?tab=cases&caseId=<id> sem caseView abre visão geral', () => {
    const result = resolveCaseView({ tab: 'cases', caseId: 'case-456' });

    expect(result.activeTab).toBe('cases');
    expect(result.caseId).toBe('case-456');
    expect(result.caseView).toBe('visao-geral');
    expect(result.redirectUrl).toBeNull();
  });

  test('?tab=cases&caseId=<id>&caseView=insights abre insights do caso', () => {
    const result = resolveCaseView({ tab: 'cases', caseId: 'case-456', caseView: 'insights' });

    expect(result.activeTab).toBe('cases');
    expect(result.caseId).toBe('case-456');
    expect(result.caseView).toBe('insights');
    expect(result.redirectUrl).toBeNull();
  });

  test('não expõe PII em logs - função não faz console', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    resolveCaseView({ tab: 'collaboration', caseId: 'case-PII' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
