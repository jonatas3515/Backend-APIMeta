/**
 * Testes de integração do cálculo de verbas trabalhistas no webhook do WhatsApp.
 * Usa os módulos reais (não mockados) e histórico de mensagens sintético.
 * Nenhum dado real, telefone, salário, data ou PII é usado.
 */

const UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const { handleLaborSettlementWebhook } = require('../lib/laborWebhookIntegration');

function makeConversation(overrides = {}) {
  return {
    id: UUID,
    client_phone_normalized: '73999998888',
    client_phone: '5573999998888',
    status: 'open',
    mode: 'bot',
    archived: false,
    ...overrides
  };
}

function clientMessage(text) {
  return { text, sender_type: 'client', created_at: new Date().toISOString() };
}

function botMessage(text) {
  return { text, sender_type: 'ai', created_at: new Date().toISOString() };
}

function makeParams(overrides = {}) {
  return {
    conversation: makeConversation(),
    normalizedPhone: '73999998888',
    waMessageId: 'wa-msg-001',
    textBody: 'Quero calcular minha rescisão',
    messageType: 'text',
    messages: [],
    log: jest.fn(),
    ...overrides
  };
}

describe('laborWebhookIntegration (simplificado por histórico)', () => {
  test('início da coleta: "Quero calcular minha rescisão" pergunta todos os campos', async () => {
    const result = await handleLaborSettlementWebhook(makeParams());

    expect(result.handled).toBe(true);
    expect(result.reply).toContain('Para estimar sua rescisão');
    expect(result.reply).toContain('salário');
    expect(result.reply).toContain('admissão');
    expect(result.reply).toContain('desligamento');
    expect(result.reply).toContain('motivo');
    expect(result.stateSaved).toBe(false);
  });

  test('"Fui demitido, quero resolver" entra na coleta', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Fui demitido, quero resolver'
    }));

    expect(result.handled).toBe(true);
    expect(result.reply).toContain('Para estimar sua rescisão');
    expect(result.flow).toBe('labor_settlement_estimate');
  });

  test('extração de salário e datas de uma mensão', async () => {
    const messages = [botMessage('Para estimar sua rescisão, preciso das seguintes informações: Qual era o salário mensal? Qual foi a data de admissão? Qual foi a data de desligamento? Qual foi o motivo do desligamento?')];
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Recebia 3000 reais, entrei em 01/05/2023 e saí em 30/06/2024',
      messages
    }));

    expect(result.handled).toBe(true);
    expect(result.reply).toContain('motivo');
  });

  test('cálculo completo usando dados da mensão atual', async () => {
    const messages = [botMessage('Para estimar sua rescisão, preciso das seguintes informações: Qual era o salário mensal? Qual foi a data de admissão? Qual foi a data de desligamento? Qual foi o motivo do desligamento?')];
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Recebia 3000 reais, entrei em 01/05/2023 e saí em 30/06/2024, fui demitido sem justa causa, aviso indenizado',
      messages
    }));

    expect(result.handled).toBe(true);
    expect(result.reply).toContain('Estimativa preliminar');
    expect(result.reply).not.toContain('Qual foi a data');
  });

  test('campo faltante: pergunta apenas o que ainda falta', async () => {
    const messages = [botMessage('Para estimar sua rescisão, preciso das seguintes informações: Qual era o salário mensal? Qual foi a data de admissão? Qual foi a data de desligamento? Qual foi o motivo do desligamento?')];
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Recebia 3000 reais e trabalhei de 01/05/2023 até 30/06/2024',
      messages
    }));

    expect(result.handled).toBe(true);
    expect(result.reply).toContain('motivo');
    expect(result.reply).not.toContain('salário');
  });

  test('histórico reconstruído: salário vem de mensagem anterior', async () => {
    const messages = [
      botMessage('Para estimar sua rescisão, preciso das seguintes informações: Qual era o salário mensal? Qual foi a data de admissão? Qual foi a data de desligamento? Qual foi o motivo do desligamento?'),
      clientMessage('Meu salário era 3000 reais'),
      botMessage('Qual foi a data de admissão?')
    ];
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Entrei em 01/05/2023 e saí em 30/06/2024, fui demitido sem justa causa, aviso indenizado',
      messages
    }));

    expect(result.handled).toBe(true);
    expect(result.reply).toContain('Estimativa preliminar');
  });

  test('mensagem comum não ativa o fluxo trabalhista', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Bom dia, gostaria de falar com um advogado'
    }));

    expect(result.handled).toBe(false);
    expect(result.reply).toBeFalsy();
  });

  test('erro técnico não emite fallback enganoso para mensagens inválidas', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: '   ',
      messageType: 'text'
    }));

    expect(result.handled).toBe(false);
    expect(result.reply).toBeFalsy();
    expect(result.errorCode).toBeFalsy();
  });

  test('"Foi hoje" normaliza a data de desligamento a partir do histórico', async () => {
    process.env.LABOR_TODAY_DATE = '2026-09-15';
    const messages = [
      botMessage('Para estimar sua rescisão, preciso das seguintes informações: Qual era o salário mensal? Qual foi a data de admissão? Qual foi a data de desligamento? Qual foi o motivo do desligamento? O aviso-prévio foi trabalhado, indenizado, não cumprido ou você não sabe?'),
      clientMessage('R$ 2.500'),
      botMessage('Qual foi a data de admissão?'),
      clientMessage('15/03/2025'),
      botMessage('Qual foi a data de desligamento?')
    ];
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Foi hoje',
      messages
    }));

    expect(result.handled).toBe(true);
    expect(result.reply).toContain('Qual foi o motivo');
    expect(result.flow).toBe('labor_settlement_estimate');
    delete process.env.LABOR_TODAY_DATE;
  });

  test('nenhum log contém texto da mensagem, salário ou data', async () => {
    const logFn = jest.fn();
    const messages = [botMessage('Para estimar sua rescisão, preciso das seguintes informações: Qual era o salário mensal?')];

    await handleLaborSettlementWebhook(makeParams({
      textBody: 'Recebia 3000 reais e entrei em 01/05/2023',
      messages,
      log: logFn
    }));

    const allCalls = logFn.mock.calls.map(c => JSON.stringify(c)).join(' ');
    expect(allCalls).not.toContain('3000');
    expect(allCalls).not.toContain('01/05/2023');
    expect(allCalls).not.toContain('Recebia 3000');
  });
});
