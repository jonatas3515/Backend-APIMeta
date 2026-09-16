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

const openingQuestion = 'Para estimar sua rescisão, preciso das seguintes informações: Qual era o salário mensal? Qual foi a data de admissão? Qual foi a data de desligamento? Qual foi o motivo do desligamento?';

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

describe('laborWebhookIntegration - desativação de perguntas rígidas', () => {
  test('início simples não emite lista de perguntas', async () => {
    const result = await handleLaborSettlementWebhook(makeParams());
    expect(result.handled).toBe(false);
    expect(result.reply).toBeFalsy();
    if (result.reply) {
      expect(result.reply).not.toContain('Para estimar sua rescisão');
    }
  });

  test('solicitação com dados insuficientes é liberada para o Gemini', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Quero calcular minha rescisão'
    }));
    expect(result.handled).toBe(false);
    expect(result.reply).toBeFalsy();
  });
});

describe('laborWebhookIntegration - extração de datas relativas', () => {
  beforeEach(() => {
    process.env.LABOR_TODAY_DATE = '2025-07-24';
  });
  afterEach(() => {
    delete process.env.LABOR_TODAY_DATE;
  });

  test('"entrei em janeiro e saí hoje" calcula estimativa com admissão em janeiro e desligamento hoje', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Recebia 2500 por mês, entrei em janeiro e saí hoje, fui demitido',
      messages: [botMessage(openingQuestion)]
    }));
    expect(result.handled).toBe(true);
    expect(result.reply).toContain('🧾 Estimativa preliminar');
    expect(result.reply).not.toContain('Para estimar sua rescisão');
    expect(result.reply).not.toContain('Qual foi a data de desligamento');
  });

  test('"hoje" preenche desligamento sem sobrescrever admissão conhecida', async () => {
    const messages = [
      botMessage(openingQuestion),
      clientMessage('Recebia 2500 por mês, entrei em janeiro')
    ];
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'saí hoje',
      messages
    }));
    expect(result.handled).toBe(true);
    expect(result.reply).toContain('🧾 Estimativa preliminar');
  });

  test('"ontem" preenche desligamento', async () => {
    const messages = [
      botMessage(openingQuestion),
      clientMessage('Recebia 2500 por mês, entrei em janeiro')
    ];
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'fui demitido ontem',
      messages
    }));
    expect(result.handled).toBe(true);
    expect(result.reply).toContain('🧾 Estimativa preliminar');
  });

  test('"janeiro" sozinho preenche admissão e libera para o Gemini até ter datas completas', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'entrei em janeiro',
      messages: [botMessage(openingQuestion)]
    }));
    expect(result.handled).toBe(false);
    expect(result.reply).toBeFalsy();
  });

  test('"janeiro dia 1" preenche admissão', async () => {
    const messages = [
      botMessage(openingQuestion),
      clientMessage('Recebia 2500 por mês')
    ];
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'janeiro dia 1',
      messages
    }));
    expect(result.handled).toBe(false); // ainda falta desligamento; não repete pergunta
    expect(result.reply).toBeFalsy();
  });

  test('"dia 02/01" é reconhecido como admissão', async () => {
    const messages = [
      botMessage(openingQuestion),
      clientMessage('Recebia 2500 por mês')
    ];
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'dia 02/01',
      messages
    }));
    expect(result.handled).toBe(false);
    expect(result.reply).toBeFalsy();
  });
});

describe('laborWebhookIntegration - Gemini assume diálogo', () => {
  test('"Aff" libera o fluxo para o Gemini', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Aff',
      messages: [botMessage(openingQuestion)]
    }));
    expect(result.handled).toBe(false);
    expect(result.reply).toBeFalsy();
  });

  test('"Oxi" libera o fluxo para o Gemini', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Oxi',
      messages: [botMessage(openingQuestion)]
    }));
    expect(result.handled).toBe(false);
    expect(result.reply).toBeFalsy();
  });

  test('saudação solta não repete pergunta trabalhista', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Bom dia Dr. Poderia me ajudar',
      messages: [botMessage(openingQuestion)]
    }));
    expect(result.handled).toBe(false);
    expect(result.reply).toBeFalsy();
  });
});

describe('laborWebhookIntegration - fluxo completo e reconhecimento', () => {
  test('dados completos em uma mensagem geram estimativa preliminar', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Quanto vou receber? Recebia R$ 3.000, entrei em 01/01/2023 e saí em 30/06/2024, fui demitido sem justa causa, aviso indenizado',
      messages: [botMessage(openingQuestion)]
    }));
    expect(result.handled).toBe(true);
    expect(result.reply).toContain('🧾 Estimativa preliminar');
  });

  test('"Indenizado" é reconhecido como aviso-prévio quando perguntado', async () => {
    const noticeQuestion = 'Para estimar sua rescisão, preciso das seguintes informações: Qual era o salário mensal? Qual foi a data de admissão? Qual foi a data de desligamento? Qual foi o motivo do desligamento? O aviso-prévio foi trabalhado, indenizado, não cumprido ou você não sabe?';
    const messages = [
      botMessage(noticeQuestion),
      clientMessage('Meu salário era 3000 reais'),
      clientMessage('01/01/2023'),
      clientMessage('30/06/2024'),
      clientMessage('fui demitido sem justa causa')
    ];
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Indenizado',
      messages
    }));
    expect(result.handled).toBe(true);
    expect(result.reply).toContain('🧾 Estimativa preliminar');
    expect(result.reply).not.toContain('O aviso-prévio foi');
  });

  test('mensagem após estimativa preliminar não reativa o fluxo', async () => {
    const messages = [
      botMessage('🧾 Estimativa preliminar da rescisão\n\n📌 Dados usados\n• Salário: R$ 3000,00')
    ];
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'mas e minhas férias?',
      messages
    }));
    expect(result.handled).toBe(false);
    expect(result.reply).toBeFalsy();
  });

  test('pergunta trabalhista com mais de 2h não força continuação', async () => {
    const oldDate = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const messages = [
      { text: openingQuestion, sender_type: 'ai', created_at: oldDate }
    ];
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Bom dia',
      messages
    }));
    expect(result.handled).toBe(false);
    expect(result.reply).toBeFalsy();
  });

  test('nenhum log contém texto da mensagem, salário ou data', async () => {
    const logFn = jest.fn();
    const messages = [botMessage(openingQuestion)];

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
