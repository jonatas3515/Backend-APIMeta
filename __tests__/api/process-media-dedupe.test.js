/**
 * /api/process-media — proteção contra duplicata.
 * Cobre: reivindicação atômica, reconciliação quando resposta já existe,
 * envio único e intervalo incerto de envio (sem retry cego).
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'MOCK-key';
process.env.GOOGLE_AI_API_KEY = '';

const AUDIO = {
  id: 'msg-audio-001',
  conversation_id: 'conv-123',
  content_type: 'audio',
  media_url: 'https://synthetic.example.com/audio.ogg',
  text: 'processando transcrição',
  media_status: 'pending',
  created_at: '2026-09-25T21:00:00.000Z'
};

const CONVERSATION = { id: 'conv-123', client_phone: '5573999998888', client_name: 'C', mode: 'bot', status: 'open' };

let scenario;
let dbLog;
let consoleOutput;
const origLog = console.log, origErr = console.error, origWarn = console.warn;

function makeQuery(table) {
  const q = { _table: table, _update: null, _insert: null, _select: false, _single: false, _filters: [] };
  const m = (name) => (...args) => {
    dbLog.push([name, ...args]);
    if (name === 'update') q._update = args[0];
    if (name === 'insert') q._insert = args[0];
    if (name === 'select') q._select = true;
    if (name === 'single') q._single = true;
    if (['eq', 'like', 'gt', 'lt', 'gte', 'lte', 'in'].includes(name)) q._filters.push([name, ...args]);
    return q;
  };
  ['select','eq','in','gt','gte','lt','lte','like','order','limit','update','insert','single','maybeSingle','neq','is','not'].forEach(n => q[n] = m(n));
  q.then = (res, rej) => {
    const has = (op, k, v) => q._filters.some(f => f[0] === op && f[1] === k && (v === undefined || f[2] === v));
    const linkFilter = q._filters.find(f => f[0] === 'like' && f[1] === 'internal_note');
    const outboundBotLookup = q._select && q._table === 'messages' && has('eq', 'direction', 'outbound') && has('eq', 'sender_type', 'bot');
    const staleLookup = q._select && q._table === 'messages' && has('eq', 'media_status', 'processing') && has('lt', 'created_at');
    let out;
    if (q._insert && q._single) out = scenario.insertReply;
    else if (q._single && table === 'conversations') out = { data: scenario.conversation, error: null };
    else if (q._update && q._update.media_status === 'processing' && q._select) out = scenario.claim;
    else if (q._update) out = { data: null, error: null };
    else if (outboundBotLookup && linkFilter) {
      // vínculo exato: só existe resposta ligada se o id estiver em linkedIds
      const m2 = String(linkFilter[2]).match(/%([^%]+)%/);
      const linkedId = m2 && m2[1];
      out = { data: (scenario.linkedIds || []).includes(linkedId) ? [{ id: `reply-of-${linkedId}` }] : [], error: null };
    }
    else if (outboundBotLookup) out = { data: scenario.legacyCandidates || [], error: null };
    else if (staleLookup) out = { data: scenario.staleProcessing || [], error: null };
    else if (q._select && table === 'messages') out = { data: scenario.pending || [], error: null };
    else out = { data: null, error: null };
    return Promise.resolve(out).then(res, rej);
  };
  return q;
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: (t) => makeQuery(t) }))
}));

jest.mock('../../lib/mediaProcessing', () => ({
  transcribeAudio: jest.fn().mockResolvedValue('TRANSCRICAO_SENSIVEL_TESTE'),
  summarizeMedia: jest.fn()
}));

jest.mock('../../lib/ai', () => ({
  askGemini: jest.fn().mockResolvedValue('RESPOSTA_BOT_TESTE')
}));

jest.mock('../../lib/whatsapp', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue('wamid-cron-1')
}));

jest.mock('../../lib/needsHuman.js', () => ({
  detectNeedsHuman: jest.fn().mockReturnValue(false),
  notifyAdminHandoff: jest.fn()
}));

const { createMocks } = require('node-mocks-http');
const handler = require('../../pages/api/process-media').default;
const { transcribeAudio } = require('../../lib/mediaProcessing');
const { sendWhatsAppMessage } = require('../../lib/whatsapp');

const run = async () => {
  const { req, res } = createMocks({ method: 'POST', body: {} });
  await handler(req, res);
  return { status: res._getStatusCode(), data: JSON.parse(res._getData()) };
};

describe('/api/process-media — proteção contra duplicata', () => {
  beforeEach(() => {
    dbLog = [];
    consoleOutput = [];
    scenario = {
      pending: [AUDIO],
      claim: { data: [{ id: AUDIO.id }], error: null },
      conversation: CONVERSATION,
      insertReply: { data: { id: 'reply-1' }, error: null },
      linkedIds: [],
      legacyCandidates: [],
      staleProcessing: []
    };
    transcribeAudio.mockClear().mockResolvedValue('TRANSCRICAO_SENSIVEL_TESTE');
    sendWhatsAppMessage.mockClear().mockResolvedValue('wamid-cron-1');
    console.log = (...a) => consoleOutput.push(a.map(String).join(' '));
    console.error = (...a) => consoleOutput.push(a.map(String).join(' '));
    console.warn = (...a) => consoleOutput.push(a.map(String).join(' '));
  });
  afterEach(() => {
    console.log = origLog; console.error = origErr; console.warn = origWarn;
  });

  test('reivindicação vazia (outro processo pegou) → nada processa nem envia', async () => {
    scenario.claim = { data: [], error: null };
    const r = await run();
    expect(r.status).toBe(200);
    expect(r.data.processed).toBe(0);
    expect(transcribeAudio).not.toHaveBeenCalled();
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  test('áudio já respondido (resposta vinculada) → reconcilia status sem reenviar', async () => {
    scenario.linkedIds = [AUDIO.id];
    const r = await run();
    expect(r.status).toBe(200);
    expect(r.data.processed).toBe(1);
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    // media_status foi fechado como processed no registro do áudio
    expect(dbLog.some(([op, payload]) => op === 'update' && payload?.media_status === 'processed')).toBe(true);
  });

  test('legado com candidato ambíguo na janela → needs_review, sem reenviar', async () => {
    scenario.legacyCandidates = [{ id: 'maybe-reply' }];
    const r = await run();
    expect(r.status).toBe(200);
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(dbLog.some(([op, payload]) => op === 'update' && payload?.media_status === 'needs_review')).toBe(true);
    // confirmações "Recebido!/analisando" foram excluídas da busca de candidatos
    expect(dbLog.some(([op, col, how, val]) => op === 'not' && col === 'text' && String(val).includes('analisando'))).toBe(true);
  });

  test('legado com só a confirmação "analisando" (sem resposta final) → responde', async () => {
    // candidates já vêm filtrados pelo .not ilike — vazio significa "só havia ack"
    scenario.legacyCandidates = [];
    const r = await run();
    expect(r.status).toBe(200);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(dbLog.some(([op, payload]) => op === 'update' && payload?.media_status === 'processed')).toBe(true);
  });

  test('dois áudios próximos, cada um com sua resposta vinculada → ambos reconciliam', async () => {
    const A2 = { ...AUDIO, id: 'msg-audio-002', created_at: '2026-09-25T21:01:00.000Z' };
    scenario.pending = [AUDIO, A2];
    scenario.linkedIds = [AUDIO.id, A2.id];
    const r = await run();
    expect(r.status).toBe(200);
    expect(r.data.processed).toBe(2);
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(dbLog.filter(([op, payload]) => op === 'update' && payload?.media_status === 'processed').length).toBe(2);
  });

  test('claim simultâneo perdido (webhook vs cron) → pulado sem transcrever', async () => {
    scenario.claim = { data: [], error: null };
    const r = await run();
    expect(transcribeAudio).not.toHaveBeenCalled();
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  test('órfão em processing é devolvido à fila condicionalmente', async () => {
    scenario.staleProcessing = [{ id: 'stale-1' }];
    const r = await run();
    // reversão condicional processing→pending: update seguido de
    // eq('id','stale-1') e eq('media_status','processing')
    const revertIdx = dbLog.findIndex(([op, payload]) => op === 'update' && payload?.media_status === 'pending');
    expect(revertIdx).toBeGreaterThan(-1);
    const nextOps = dbLog.slice(revertIdx + 1, revertIdx + 3).map(([op, k, v]) => `${op}:${k}=${v}`);
    expect(nextOps).toContain('eq:id=stale-1');
    expect(nextOps).toContain('eq:media_status=processing');
  });

  test('áudio sem resposta existente → envia uma vez e grava wa_message_id', async () => {
    const r = await run();
    expect(r.status).toBe(200);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(dbLog.some(([op, payload]) => op === 'update' && payload?.wa_message_id === 'wamid-cron-1' && payload?.status === 'sent')).toBe(true);
    // resposta vinculada ao áudio de origem
    expect(dbLog.some(([op, payload]) => op === 'insert' && typeof payload?.internal_note === 'string' && payload.internal_note.includes(AUDIO.id))).toBe(true);
  });

  test('envio sem confirmação (timeout) → outbound unconfirmed, sem retry', async () => {
    sendWhatsAppMessage.mockRejectedValueOnce(new TypeError('fetch failed'));
    const r = await run();
    expect(r.status).toBe(200);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(dbLog.some(([op, payload]) => op === 'update' && payload?.status === 'unconfirmed')).toBe(true);
  });

  test('nenhum log expõe transcrição ou telefone', async () => {
    await run();
    const all = consoleOutput.join('\n');
    expect(all).not.toContain('TRANSCRICAO_SENSIVEL_TESTE');
    expect(all).not.toContain('5573999998888');
  });
});
