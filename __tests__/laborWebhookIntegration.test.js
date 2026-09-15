/**
 * Testes de integração do cálculo de verbas trabalhistas no webhook do WhatsApp.
 * Usa mocks para lib/laborSettlementState e lib/laborSettlementAdapter.
 * Nenhum dado real, telefone, salário, data ou PII é usado.
 */

const UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const OTHER_UUID = 'b1ffcdaa-ad1c-5f19-cc7e-7cc0ce491b22';

const mockLoad = jest.fn();
const mockSave = jest.fn();
const mockDelete = jest.fn();
const mockAdapt = jest.fn();

jest.mock('../lib/laborSettlementState', () => ({
  loadLaborSettlementState: (...args) => mockLoad(...args),
  saveLaborSettlementState: (...args) => mockSave(...args),
  deleteLaborSettlementState: (...args) => mockDelete(...args)
}));

jest.mock('../lib/laborSettlementAdapter', () => ({
  adaptLaborSettlement: (...args) => mockAdapt(...args)
}));

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

function makeParams(overrides = {}) {
  return {
    conversation: makeConversation(),
    normalizedPhone: '73999998888',
    waMessageId: 'wa-msg-001',
    textBody: 'Quero calcular minha rescisão',
    messageType: 'text',
    log: jest.fn(),
    ...overrides
  };
}

function collectingResult(text, collected = {}) {
  return {
    handled: true,
    flow: 'labor_settlement_estimate',
    state: {
      active: true,
      intent: 'labor_settlement_estimate',
      status: 'collecting',
      collected,
      askedFields: ['salary']
    },
    response: { text },
    calculation: null,
    missingFields: ['salary'],
    warnings: []
  };
}

describe('laborWebhookIntegration', () => {
  beforeEach(() => {
    mockLoad.mockReset();
    mockSave.mockReset();
    mockDelete.mockReset();
    mockAdapt.mockReset();
  });

  test('mensagem comum não trabalhista retorna handled=false e não chama save', async () => {
    mockAdapt.mockReturnValue({ handled: false, state: { active: false } });

    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Bom dia'
    }));

    expect(result).toEqual({ handled: false, reply: null, stateSaved: false, errorCode: null });
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  test('nova solicitação trabalhista carrega state e chama adaptador', async () => {
    mockLoad.mockResolvedValue(null);
    mockAdapt.mockReturnValue(collectingResult('Qual era o salário mensal?'));
    mockSave.mockResolvedValue({ id: UUID });

    const result = await handleLaborSettlementWebhook(makeParams());

    expect(result.handled).toBe(true);
    expect(result.reply).toBe('Qual era o salário mensal?');
    expect(result.stateSaved).toBe(true);
    expect(mockLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: UUID,
        authorizationContext: { userId: 'system:whatsapp', allowedConversationId: UUID }
      })
    );
  });

  test('continuação carrega estado existente e salva com expectedUpdatedAt', async () => {
    const loadedState = {
      conversationId: UUID,
      active: true,
      collected: { salary: 2500 },
      askedFields: ['salary'],
      updatedAt: '2024-01-01T00:00:00.000Z'
    };
    mockLoad.mockResolvedValue(loadedState);
    mockAdapt.mockReturnValue(collectingResult('Qual foi a data de admissão?'));
    mockSave.mockResolvedValue({ id: UUID });

    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: '2500'
    }));

    expect(result.handled).toBe(true);
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedUpdatedAt: loadedState.updatedAt
      })
    );
  });

  test('estado ativo não é perdido entre mensagens', async () => {
    const loadedState = {
      conversationId: UUID,
      active: true,
      collected: { salary: 2500 },
      askedFields: ['salary'],
      updatedAt: '2024-01-01T00:00:00.000Z'
    };
    mockLoad.mockResolvedValue(loadedState);
    mockAdapt.mockReturnValue(collectingResult('Qual foi a data de admissão?'));
    mockSave.mockResolvedValue(loadedState);

    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: '2500'
    }));

    expect(result.handled).toBe(true);
    expect(result.stateSaved).toBe(true);
    expect(mockAdapt).toHaveBeenCalledWith(
      expect.objectContaining({
        state: loadedState
      })
    );
  });

  test('dados completos geram resposta de estimativa e excluem estado', async () => {
    mockLoad.mockResolvedValue(null);
    mockAdapt.mockReturnValue({
      handled: true,
      flow: 'labor_settlement_estimate',
      state: {
        active: false,
        intent: 'labor_settlement_estimate',
        status: 'completed',
        collected: {
          salary: 2500,
          admissionDate: '2024-01-01',
          terminationDate: '2025-06-30',
          terminationReason: 'dispensa_sem_justa_causa'
        },
        askedFields: []
      },
      response: {
        text: 'Segundo a simulação, os valores estimados são...'
      },
      calculation: { total: 1234.56 },
      missingFields: [],
      warnings: ['Estimativa preliminar.']
    });
    mockDelete.mockResolvedValue({});

    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'fui demitido sem justa causa'
    }));

    expect(result.handled).toBe(true);
    expect(result.reply).toBeTruthy();
    expect(mockDelete).toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  test('labor_question não inicia cálculo automático e envia orientação', async () => {
    mockLoad.mockResolvedValue(null);
    mockAdapt.mockReturnValue({
      handled: true,
      flow: 'labor_question',
      state: {
        active: false,
        intent: null,
        status: 'idle',
        collected: {},
        askedFields: []
      },
      response: {
        text: 'Vejo que você tem uma dúvida trabalhista...'
      }
    });

    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Posso pedir rescisão indireta?'
    }));

    expect(result.handled).toBe(true);
    expect(result.reply).toBeTruthy();
    expect(result.stateSaved).toBe(false);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  test('conversa mode=human não integra', async () => {
    mockAdapt.mockReturnValue({ handled: true, state: { active: true } });

    const result = await handleLaborSettlementWebhook(makeParams({
      conversation: makeConversation({ mode: 'human' })
    }));

    expect(result.handled).toBe(false);
    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockAdapt).not.toHaveBeenCalled();
  });

  test('conversa fechada/arquivada não integra', async () => {
    mockAdapt.mockReturnValue({ handled: true, state: { active: true } });

    const result = await handleLaborSettlementWebhook(makeParams({
      conversation: makeConversation({ status: 'closed', archived: true })
    }));

    expect(result.handled).toBe(false);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  test('conversa com mode nulo (regressão) integra como bot', async () => {
    mockLoad.mockResolvedValue(null);
    mockAdapt.mockReturnValue(collectingResult('Qual era o salário mensal?'));
    mockSave.mockResolvedValue({ id: UUID });

    const result = await handleLaborSettlementWebhook(makeParams({
      conversation: makeConversation({ mode: null })
    }));

    expect(result.handled).toBe(true);
    expect(result.reply).toBe('Qual era o salário mensal?');
    expect(mockLoad).toHaveBeenCalled();
  });

  test('conversa com status nulo (regressão) integra como aberta', async () => {
    mockLoad.mockResolvedValue(null);
    mockAdapt.mockReturnValue(collectingResult('Qual era o salário mensal?'));
    mockSave.mockResolvedValue({ id: UUID });

    const result = await handleLaborSettlementWebhook(makeParams({
      conversation: makeConversation({ status: null })
    }));

    expect(result.handled).toBe(true);
    expect(result.reply).toBe('Qual era o salário mensal?');
    expect(mockLoad).toHaveBeenCalled();
  });

  test('mensagem não textual não integra', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      messageType: 'image',
      textBody: '[Imagem enviada]'
    }));

    expect(result.handled).toBe(false);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  test('authorizationContext usa conversation.id vindo do Supabase', async () => {
    mockLoad.mockResolvedValue(null);
    mockAdapt.mockReturnValue(collectingResult('Qual era o salário?'));
    mockSave.mockResolvedValue({ id: UUID });

    const result = await handleLaborSettlementWebhook(makeParams());

    expect(result.handled).toBe(true);
    expect(mockLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationContext: { userId: 'system:whatsapp', allowedConversationId: UUID }
      })
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationContext: { userId: 'system:whatsapp', allowedConversationId: UUID }
      })
    );
  });

  test('telefone normalizado incompatível não integra', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      normalizedPhone: '11999998888'
    }));

    expect(result.handled).toBe(false);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  test('save usa ID da mensagem como lastMessageHash', async () => {
    mockLoad.mockResolvedValue(null);
    mockAdapt.mockReturnValue(collectingResult('Qual era o salário?'));
    mockSave.mockResolvedValue({ id: UUID });

    await handleLaborSettlementWebhook(makeParams({ waMessageId: 'wa-msg-hash-123' }));

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          lastMessageHash: 'wa-msg-hash-123'
        })
      })
    );
  });

  test('cancelamento exclui estado', async () => {
    mockLoad.mockResolvedValue({
      conversationId: UUID,
      active: true,
      collected: { salary: 2500 },
      askedFields: ['salary'],
      updatedAt: '2024-01-01T00:00:00.000Z'
    });
    mockAdapt.mockReturnValue({
      handled: true,
      flow: 'labor_settlement_estimate',
      state: {
        active: false,
        intent: null,
        status: 'cancelled',
        collected: {},
        askedFields: []
      },
      response: { text: 'Simulação cancelada.' }
    });
    mockDelete.mockResolvedValue({});

    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'cancelar'
    }));

    expect(result.handled).toBe(true);
    expect(result.reply).toBe('Simulação cancelada.');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  test('conflito de concorrência não sobrescreve estado e envia mensagem segura', async () => {
    mockLoad.mockResolvedValue({
      conversationId: UUID,
      active: true,
      collected: { salary: 2500 },
      askedFields: ['salary'],
      updatedAt: '2024-01-01T00:00:00.000Z'
    });
    mockAdapt.mockReturnValue(collectingResult('Qual foi a data de admissão?'));
    mockSave.mockRejectedValue({
      code: 'CONCURRENCY_CONFLICT',
      message: 'Conflito de concorrência'
    });

    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: '2500'
    }));

    expect(result.handled).toBe(true);
    expect(result.stateSaved).toBe(false);
    expect(result.errorCode).toBe('CONCURRENCY_CONFLICT');
    expect(result.reply).toContain('Pode repetir');
  });

  test('ENCRYPTION_FAILED não salva em claro', async () => {
    mockLoad.mockResolvedValue(null);
    mockAdapt.mockReturnValue(collectingResult('Qual era o salário?'));
    mockSave.mockRejectedValue({
      code: 'ENCRYPTION_FAILED',
      message: 'Falha na criptografia'
    });

    const result = await handleLaborSettlementWebhook(makeParams());

    expect(result.handled).toBe(true);
    expect(result.stateSaved).toBe(false);
    expect(result.errorCode).toBe('ENCRYPTION_FAILED');
    expect(result.reply).toContain('Pode repetir');
  });

  test('falha ao carregar estado não derruba mensagens comuns', async () => {
    mockLoad.mockRejectedValue({ code: 'LOAD_FAILED', message: 'Falha' });

    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: 'Bom dia'
    }));

    expect(result.handled).toBe(false);
    expect(result.errorCode).toBe('LOAD_FAILED');
    expect(mockAdapt).not.toHaveBeenCalled();
  });

  test('ausência de texto não ativa o fluxo', async () => {
    const result = await handleLaborSettlementWebhook(makeParams({
      textBody: '   '
    }));

    expect(result.handled).toBe(false);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  test('nenhum log contém texto da mensagem, salário ou data', async () => {
    const logFn = jest.fn();
    mockLoad.mockResolvedValue(null);
    mockAdapt.mockReturnValue(collectingResult('Qual era o salário?'));
    mockSave.mockRejectedValue({ code: 'ENCRYPTION_FAILED', message: 'Falha' });

    await handleLaborSettlementWebhook(makeParams({
      textBody: 'Quero calcular minha rescisão',
      log: logFn
    }));

    const allCalls = logFn.mock.calls.map(c => JSON.stringify(c)).join(' ');
    expect(allCalls).not.toContain('Quero calcular minha rescisão');
    expect(allCalls).not.toContain('2500');
    expect(allCalls).not.toContain('2024-01-01');
  });

  test('mensagem duplicada não gera duplicidade de resposta', async () => {
    const loadedState = {
      conversationId: UUID,
      active: true,
      collected: { salary: 2500 },
      askedFields: ['salary'],
      updatedAt: '2024-01-01T00:00:00.000Z'
    };
    mockLoad.mockResolvedValue(loadedState);
    mockAdapt.mockReturnValue(collectingResult('Pergunta repetida?'));
    mockSave.mockResolvedValue(loadedState);

    const result = await handleLaborSettlementWebhook(makeParams({
      waMessageId: 'wa-msg-001'
    }));

    expect(result.handled).toBe(true);
    expect(mockSave).toHaveBeenCalled();
    const saveCall = mockSave.mock.calls[0][0];
    expect(saveCall.state.lastMessageHash).toBe('wa-msg-001');
  });
});
