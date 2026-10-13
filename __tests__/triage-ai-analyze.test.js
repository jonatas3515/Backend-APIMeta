/**
 * Testes do endpoint POST /api/triage/ai-analyze
 */
const mockAskGeminiJson = jest.fn();
jest.mock('../lib/ai', () => ({
  askGeminiJson: (...args) => mockAskGeminiJson(...args)
}));

jest.mock('../lib/auth', () => ({
  withAuth: (fn) => async (req, res) => {
    req.user = { id: 'u1', role: 'advogado', name: 'Dr. Ana' };
    return fn(req, res);
  },
  supabaseAdmin: { from: jest.fn() }
}));

const handler = require('../pages/api/triage/ai-analyze').default;

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function makeReq(body, method = 'POST') {
  return { method, body, headers: {}, query: {} };
}

beforeEach(() => {
  mockAskGeminiJson.mockReset();
});

describe('POST /api/triage/ai-analyze', () => {
  test('rejeita metodo diferente de POST', async () => {
    const res = mockRes();
    await handler(makeReq({}, 'GET'), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('retorna 400 sem movement_text', async () => {
    const res = mockRes();
    await handler(makeReq({ movement_id: 'm1' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockAskGeminiJson).not.toHaveBeenCalled();
  });

  test('analisa movimentacao e retorna campos normalizados', async () => {
    mockAskGeminiJson.mockResolvedValue('{"summary":"Intimação para manifestar.","deadline_days":15,"suggested_action":"Petição de Réplica","urgency":"alta"}');

    const res = mockRes();
    await handler(makeReq({ movement_id: 'm1', movement_text: 'Intime-se a parte autora...', case_title: 'Ação X', court_code: 'TJBA' }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.movement_id).toBe('m1');
    expect(payload.analysis).toEqual({
      summary: 'Intimação para manifestar.',
      deadline_days: 15,
      suggested_action: 'Petição de Réplica',
      urgency: 'alta'
    });
    expect(payload.disclaimer).toBeTruthy();

    // Prompt enviado à IA contém contexto do caso
    const prompt = mockAskGeminiJson.mock.calls[0][0];
    expect(prompt).toContain('Ação X');
    expect(prompt).toContain('TJBA');
  });

  test('tolera JSON dentro de bloco markdown', async () => {
    mockAskGeminiJson.mockResolvedValue('Claro! Aqui está:\n```json\n{"summary":"Despacho.","deadline_days":null,"suggested_action":"Ciência sem prazo","urgency":"baixa"}\n```');

    const res = mockRes();
    await handler(makeReq({ movement_text: 'Despacho de mero expediente' }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].analysis.deadline_days).toBeNull();
  });

  test('normaliza urgency invalida para media e deadline_days nulo', async () => {
    mockAskGeminiJson.mockResolvedValue('{"summary":"Juntada.","deadline_days":"abc","suggested_action":"Arquivar","urgency":"super-urgente"}');

    const res = mockRes();
    await handler(makeReq({ movement_text: 'Juntada de documento' }), res);

    const analysis = res.json.mock.calls[0][0].analysis;
    expect(analysis.urgency).toBe('media');
    expect(analysis.deadline_days).toBeNull();
  });

  test('retorna 502 quando a IA nao gera JSON utilizavel', async () => {
    mockAskGeminiJson.mockResolvedValue('Não consegui analisar este texto, desculpe.');

    const res = mockRes();
    await handler(makeReq({ movement_text: 'texto qualquer' }), res);

    expect(res.status).toHaveBeenCalledWith(502);
  });

  test('retorna 500 quando o Gemini falha', async () => {
    mockAskGeminiJson.mockRejectedValue(new Error('Gemini indisponível'));

    const res = mockRes();
    await handler(makeReq({ movement_text: 'texto qualquer' }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
