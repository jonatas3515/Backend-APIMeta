/**
 * Testes de integração do cálculo de verbas trabalhistas no webhook do WhatsApp.
 * Usa os módulos reais (não mockados) e histórico de mensagens sintético.
 * Nenhum dado real, telefone, salário, data ou PII é usado.
 */

const UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const {
  handleLaborSettlementWebhook,
  isTopicResetCommand,
  buildLaborContextReset,
  getActiveMessages,
  RESET_REPLY_TEXT
} = require('../lib/laborWebhookIntegration');

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

  test('pergunta de FGTS com estimativa persistida é respondida pelo JS, sem Gemini', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Quanto dá só de FGTS com essa multa aí?',
      conversation: makeConversation({
        intake_data: {
          laborCalculation: {
            totalEstimated: 2240,
            currency: 'BRL',
            calculatedAt: new Date().toISOString(),
            items: [
              { code: 'fgts_deposits', name: 'FGTS estimado (8% mensal)', amount: 1600, status: 'calculated' },
              { code: 'fgts_penalty_40', name: 'Multa de 40% sobre FGTS', amount: 640, status: 'calculated' }
            ]
          }
        }
      }),
      messages: [botMessage('🧾 Estimativa preliminar da rescisão')]
    }));
    expect(result.handled).toBe(true);
    expect(result.flow).toBe('labor_value_answer');
    expect(result.reply).toContain('1.600,00');
    expect(result.reply).toContain('640,00');
    expect(result.reply).toContain('2.240,00');
    expect(result.reply).toContain('estimativa');
  });

  test('pergunta de FGTS sem estimativa persistida recalcula a partir dos dados coletados', async () => {
    process.env.LABOR_TODAY_DATE = '2025-09-16';
    try {
      const result = await handleLaborSettlementWebhook(makeParams({
        textBody: 'Quanto dá só de FGTS com essa multa aí?',
        messages: [
          clientMessage('anhava 2500 por mes, entrei em janeiro e hoje o patrao me mandou embora e disse que nao era pra voltar. eles nunca assinaram minha carteira.'),
          botMessage('🧾 Estimativa preliminar da rescisão')
        ]
      }));
      expect(result.handled).toBe(true);
      expect(result.flow).toBe('labor_value_answer');
      expect(result.calculation).toBeTruthy();
      const deposits = result.calculation.items.find(i => i.code === 'fgts');
      const penalty = result.calculation.items.find(i => i.code === 'fgts_fine');
      expect(deposits.amount).toBeGreaterThan(0);
      expect(penalty.amount).toBeGreaterThan(0);
      const fmt = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      expect(result.reply).toContain(fmt(deposits.amount));
      expect(result.reply).toContain(fmt(penalty.amount));
      expect(result.reply).toContain(fmt(deposits.amount + penalty.amount));
    } finally {
      delete process.env.LABOR_TODAY_DATE;
    }
  });

  test('valores alucinados em mensagens antigas do bot não contaminam a resposta', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Quanto dá só de FGTS com essa multa aí?',
      conversation: makeConversation({
        intake_data: {
          laborCalculation: {
            totalEstimated: 2240,
            currency: 'BRL',
            calculatedAt: new Date().toISOString(),
            items: [
              { code: 'fgts_deposits', name: 'FGTS estimado (8% mensal)', amount: 1600, status: 'calculated' },
              { code: 'fgts_penalty_40', name: 'Multa de 40% sobre FGTS', amount: 640, status: 'calculated' }
            ]
          }
        }
      }),
      messages: [
        botMessage('🧾 Estimativa preliminar da rescisão'),
        botMessage('O FGTS totalizaria aproximadamente R$ 2.800,00 e o total R$ 5.500,00.')
      ]
    }));
    expect(result.handled).toBe(true);
    expect(result.reply).toContain('1.600,00');
    expect(result.reply).not.toContain('2.800');
    expect(result.reply).not.toContain('5.500');
  });

  test('pergunta de valor sem estimativa nem dados retorna mensagem segura', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Quanto dá só de FGTS?',
      messages: [botMessage(openingQuestion)]
    }));
    expect(result.handled).toBe(true);
    expect(result.flow).toBe('labor_value_blocked');
    expect(result.reply).toBe('Ainda não tenho uma estimativa calculada para informar esse valor. Vou confirmar os dados de salário e período antes de calcular.');
    expect(result.calculation).toBeNull();
  });

  test('pergunta de horas extras não recebe valor inventado', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'E as horas extras, quanto dá?',
      conversation: makeConversation({
        intake_data: {
          laborCalculation: {
            totalEstimated: 2240,
            currency: 'BRL',
            items: [
              { code: 'fgts_deposits', name: 'FGTS estimado (8% mensal)', amount: 1600, status: 'calculated' }
            ]
          }
        }
      }),
      messages: [botMessage('🧾 Estimativa preliminar da rescisão')]
    }));
    expect(result.handled).toBe(true);
    expect(result.reply).toContain('equipe jurídica');
    expect(result.reply).not.toMatch(/R\$\s*\d/);
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

describe('laborWebhookIntegration - troca de assunto', () => {
  test.each([
    'É outro assunto',
    'quero falar de outra coisa',
    'quero tratar de outro assunto',
    'mudar de assunto',
    'assunto diferente',
    'não é sobre isso',
    'esquece isso',
    'quero perguntar outra coisa',
    'eh outro asunto',
    'vamos falar de outra coisa'
  ])('"%s" é reconhecido como comando de troca de assunto', (text) => {
    expect(isTopicResetCommand(text)).toBe(true);
  });

  test('comando de troca retorna resposta fixa e não chama o Gemini', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'É outro assunto',
      conversation: makeConversation({
        intake_data: {
          laborCalculation: {
            totalEstimated: 5000,
            currency: 'BRL',
            calculatedAt: new Date().toISOString(),
            items: [{ code: 'salary_balance', name: 'Saldo de salário', amount: 1000, status: 'calculated' }]
          }
        }
      }),
      messages: [botMessage('🧾 Estimativa preliminar')]
    }));
    expect(result.handled).toBe(true);
    expect(result.reset).toBe(true);
    expect(result.flow).toBe('topic_reset');
    expect(result.reply).toBe(RESET_REPLY_TEXT);
    expect(result.reply).not.toContain('Estimativa');
    expect(result.calculation).toBeFalsy();
  });

  test('após reset, cálculo antigo não é carregado', () => {
    const intake = buildLaborContextReset({
      laborCalculation: { totalEstimated: 1234 },
      laborFields: { salary: 2500 },
      answers: { nome: 'Cliente' }
    });
    expect(intake.laborCalculation).toBeUndefined();
    expect(intake.laborFields).toBeUndefined();
    expect(intake.laborContextActive).toBe(false);
    expect(intake.laborContextResetAt).toBeTruthy();
    expect(intake.answers).toEqual({ nome: 'Cliente' });
  });

  test('mensagens anteriores ao reset não fazem parte do contexto ativo', () => {
    const resetAt = new Date().toISOString();
    const oldMsg = { ...clientMessage('salário 3000'), created_at: new Date(Date.now() - 1000).toISOString() };
    const newMsg = { ...clientMessage('Bom dia'), created_at: new Date(Date.now() + 1000).toISOString() };
    const active = getActiveMessages([oldMsg, newMsg], { laborContextActive: false, laborContextResetAt: resetAt });
    expect(active).toEqual([newMsg]);
  });
});
