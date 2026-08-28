/**
 * process-movements API tests (review, create-note, create-agenda-event)
 */

const { createMocks } = require('node-mocks-http');
const {
  SYNTHETIC_USER_ADVOGADO,
  SYNTHETIC_USER_ESTAGIARIO,
  SYNTHETIC_CASE,
  SYNTHETIC_CASE_PROCESS,
  SYNTHETIC_PROCESS_MOVEMENT,
} = require('../fixtures/synthetic-data');
const { makeChain } = require('../helpers/datajud-chains');

jest.mock('../../lib/auth', () => {
  const ROLE_HIERARCHY = { admin: 3, advogado: 2, estagiario: 1 };
  return {
    withAuth: jest.fn((handler, options = {}) => async (req, res) => {
      if (!req.headers?.authorization) {
        return res.status(401).json({ error: 'Token não fornecido' });
      }
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Perfil não encontrado' });
      }
      if (options.minRole && (ROLE_HIERARCHY[user.role] || 0) < ROLE_HIERARCHY[options.minRole]) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
      return handler(req, res);
    }),
    ROLE_HIERARCHY,
  };
});

jest.mock('../../lib/caseAuth', () => ({
  verifyCaseAccess: jest.fn(async () => ({ allowed: true, caseId: SYNTHETIC_CASE.id })),
  resolveCaseIdForMovement: jest.fn(async () => SYNTHETIC_CASE.id),
}));

describe('process-movements API', () => {
  let mockSupabase;
  let reviewHandler;
  let createNoteHandler;
  let createAgendaHandler;

  const movementChain = makeChain({ data: {
    ...SYNTHETIC_PROCESS_MOVEMENT,
    review_status: 'revisada',
    case_processes: {
      case_id: SYNTHETIC_CASE.id,
      cases: { conversation_id: 'conv-synthetic-001' },
    },
  }, error: null });

  const notesChain = makeChain({ data: { id: 'note-synthetic-001', text: 'Nota do advogado' }, error: null });
  const eventsChain = makeChain({ data: { id: 'event-synthetic-001', title: 'Audiência' }, error: null });
  const logChain = makeChain({ data: null, error: null });

  beforeAll(() => {
    mockSupabase = {
      from: jest.fn((table) => {
        if (table === 'process_movements') return movementChain;
        if (table === 'internal_notes') return notesChain;
        if (table === 'case_events') return eventsChain;
        return logChain;
      }),
      auth: { getUser: jest.fn() },
    };
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => mockSupabase),
    }));
    jest.resetModules();
    reviewHandler = require('../../pages/api/process-movements/[id]/review').default;
    createNoteHandler = require('../../pages/api/process-movements/[id]/create-note').default;
    createAgendaHandler = require('../../pages/api/process-movements/[id]/create-agenda-event').default;
  });

  afterAll(() => {
    jest.dontMock('@supabase/supabase-js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseReq = (overrides = {}) => ({
    method: 'POST',
    headers: { authorization: 'Bearer mock-token' },
    user: SYNTHETIC_USER_ADVOGADO,
    query: { id: SYNTHETIC_PROCESS_MOVEMENT.id },
    body: {},
    ...overrides,
  });

  test('review: estagiário é bloqueado (403)', async () => {
    const { req, res } = createMocks(baseReq({
      user: SYNTHETIC_USER_ESTAGIARIO,
      body: { review_status: 'revisada' },
    }));
    await reviewHandler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  test('review: advogado consegue revisar', async () => {
    const { req, res } = createMocks(baseReq({
      body: { review_status: 'revisada', review_notes: 'Revisado' },
    }));
    await reviewHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.review_status).toBe('revisada');
  });

  test('review: status inválido retorna 400', async () => {
    const { req, res } = createMocks(baseReq({
      body: { review_status: 'invalido' },
    }));
    await reviewHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  test('review: sem acesso ao caso retorna 403', async () => {
    const { verifyCaseAccess } = require('../../lib/caseAuth');
    verifyCaseAccess.mockResolvedValueOnce({ allowed: false, caseId: null });

    const { req, res } = createMocks(baseReq({
      body: { review_status: 'revisada' },
    }));
    await reviewHandler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  test('create-note: estagiário é bloqueado (403)', async () => {
    const { req, res } = createMocks(baseReq({
      user: SYNTHETIC_USER_ESTAGIARIO,
      body: { note: 'Nota do estagiário' },
    }));
    await createNoteHandler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  test('create-note: advogado cria nota e movimentação é convertida', async () => {
    const { req, res } = createMocks(baseReq({
      body: { note: 'Nota do advogado' },
    }));
    await createNoteHandler(req, res);
    expect(res._getStatusCode()).toBe(201);
    const body = JSON.parse(res._getData());
    expect(body.note.text).toBe('Nota do advogado');
  });

  test('create-note: sem acesso ao caso retorna 403', async () => {
    const { verifyCaseAccess } = require('../../lib/caseAuth');
    verifyCaseAccess.mockResolvedValueOnce({ allowed: false, caseId: null });

    const { req, res } = createMocks(baseReq({
      body: { note: 'Nota inválida' },
    }));
    await createNoteHandler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  test('create-agenda-event: estagiário é bloqueado (403)', async () => {
    const { req, res } = createMocks(baseReq({
      user: SYNTHETIC_USER_ESTAGIARIO,
      body: { event_date: '2024-12-31', title: 'Audiência' },
    }));
    await createAgendaHandler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  test('create-agenda-event: advogado cria evento', async () => {
    const { req, res } = createMocks(baseReq({
      body: { event_date: '2024-12-31', event_time: '10:00', title: 'Audiência', priority: 'alta' },
    }));
    await createAgendaHandler(req, res);
    expect(res._getStatusCode()).toBe(201);
    const body = JSON.parse(res._getData());
    expect(body.title).toBe('Audiência');
  });

  test('create-agenda-event: validação de prioridade inválida', async () => {
    const { req, res } = createMocks(baseReq({
      body: { event_date: '2024-12-31', title: 'Audiência', priority: 'urgente' },
    }));
    await createAgendaHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });
});
