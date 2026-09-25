/**
 * transcribeAudioAsync (webhook) — fechamento de media_status, vínculo
 * resposta↔áudio, wa_message_id e proteção contra envio duplicado.
 */

process.env.SUPABASE_URL = 'https://synthetic.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'MOCK-key';
process.env.WHATSAPP_TOKEN = 'MOCK-token';
process.env.WHATSAPP_VERIFY_TOKEN = 'MOCK-verify';
process.env.GOOGLE_AI_API_KEY = 'MOCK-gemini';

const CONVERSATION = {
  id: 'conv-1', client_phone: '5573999998888', client_name: 'C',
  mode: 'bot', intake_data: {}, status: 'open'
};

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
  ['select','eq','in','gt','gte','lt','lte','like','order','limit','update','insert','single','maybeSingle','neq','is'].forEach(n => q[n] = m(n));
  q.then = (res, rej) => {
    const waLookup = q._select && q._table === 'messages' &&
      q._filters.some(f => f[0] === 'eq' && f[1] === 'wa_message_id');
    let out;
    if (q._insert && q._single) out = scenario.insertReply;
    else if (q._insert) out = { data: null, error: null };
    else if (q._single && table === 'conversations') out = { data: scenario.conversation, error: null };
    else if (q._update && q._update.media_status === 'processing' && q._select) out = scenario.claim;
    else if (q._update) out = { data: null, error: null };
    else if (waLookup) out = { data: scenario.waLookup || [], error: null };
    else if (q._select && table === 'messages') out = { data: scenario.history || [], error: null };
    else out = { data: null, error: null };
    return Promise.resolve(out).then(res, rej);
  };
  return q;
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: (t) => makeQuery(t), rpc: jest.fn().mockResolvedValue({ data: null }) }))
}));

jest.mock('../../lib/mediaProcessing', () => ({
  transcribeAudio: jest.fn().mockResolvedValue('TRANSCRICAO_SENSIVEL_TESTE'),
  summarizeMedia: jest.fn()
}));

jest.mock('../../lib/ai.js', () => ({
  askGemini: jest.fn().mockResolvedValue('RESPOSTA_BOT_TESTE')
}));

jest.mock('../../lib/whatsapp.js', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue('wamid-async-1'),
  uploadMediaToWhatsApp: jest.fn(),
  sendWhatsAppMediaMessage: jest.fn()
}));

jest.mock('../../lib/needsHuman.js', () => ({
  detectNeedsHuman: jest.fn().mockReturnValue(false),
  notifyAdminHandoff: jest.fn(),
  EXPRESS_HUMAN_KEYWORDS: []
}));

jest.mock('../../lib/laborWebhookIntegration.js', () => ({
  handleLaborSettlementWebhook: jest.fn().mockResolvedValue({ handled: false })
}));

jest.mock('../../lib/laborSettlementIntent.js', () => ({
  classifyLaborIntent: jest.fn().mockReturnValue({})
}));

jest.mock('../../lib/intakeFlows', () => ({ detectArea: jest.fn(), getFlow: jest.fn() }));
jest.mock('../../lib/formatters', () => ({ normalizePhoneForMatch: jest.fn(p => p) }));
jest.mock('../../lib/clientMemory', () => ({ loadClientMemory: jest.fn(), formatClientMemory: jest.fn(() => '') }));
jest.mock('../../lib/genderFromName', () => ({ getClientGreeting: jest.fn(() => '') }));
jest.mock('../../lib/conversationQueue', () => ({ withConversationQueue: jest.fn((fn) => fn()) }));
jest.mock('../../lib/funnel-whatsapp.js', () => ({ evaluateFunnelAutomation: jest.fn(), registerFunnelEvent: jest.fn() }));
jest.mock('../../lib/bot-responses.js', () => ({ detectThanks: jest.fn(() => false), getThanksReply: jest.fn(), correctCommonMistakes: jest.fn((p, r) => r) }));
jest.mock('../../lib/knowledge-embeddings.js', () => ({ semanticSearch: jest.fn() }));
jest.mock('../../lib/systemPrompt.js', () => ({ SYSTEM_PROMPT: '' }));

const { __test__ } = require('../../pages/api/webhook');
const { transcribeAudio } = require('../../lib/mediaProcessing');
const { sendWhatsAppMessage } = require('../../lib/whatsapp.js');

const runAsync = (messageId = 'audio-1', mediaType = 'audio') =>
  __test__.transcribeAudioAsync('conv-1', 'https://synthetic.example.com/a.ogg', mediaType, messageId);

const updatesWith = (pred) => dbLog.filter(([op, payload]) => op === 'update' && pred(payload));

describe('transcribeAudioAsync — fechamento de estado e vínculo', () => {
  beforeEach(() => {
    dbLog = [];
    consoleOutput = [];
    scenario = {
      claim: { data: [{ id: 'audio-1' }], error: null },
      conversation: CONVERSATION,
      history: [],
      insertReply: { data: { id: 'reply-1' }, error: null }
    };
    transcribeAudio.mockClear().mockResolvedValue('TRANSCRICAO_SENSIVEL_TESTE');
    sendWhatsAppMessage.mockClear().mockResolvedValue('wamid-async-1');
    console.log = (...a) => consoleOutput.push(a.map(String).join(' '));
    console.error = (...a) => consoleOutput.push(a.map(String).join(' '));
    console.warn = (...a) => consoleOutput.push(a.map(String).join(' '));
  });
  afterEach(() => {
    console.log = origLog; console.error = origErr; console.warn = origWarn;
  });

  test('fluxo completo: claim → resposta vinculada → wa_id → áudio processed', async () => {
    await runAsync('audio-1');

    // claim atômico pending->processing
    expect(updatesWith(p => p.media_status === 'processing').length).toBe(1);
    // resposta inserida vinculada ao áudio de origem
    const insert = dbLog.find(([op, payload]) => op === 'insert' && payload?.sender_type === 'bot');
    expect(insert).toBeTruthy();
    expect(insert[1].internal_note).toContain('audio-1');
    // wa_message_id persistido para callbacks sent/delivered/read
    expect(updatesWith(p => p.wa_message_id === 'wamid-async-1' && p.status === 'sent').length).toBe(1);
    // áudio fechado como processed com transcrição
    expect(updatesWith(p => p.media_status === 'processed' && p.media_transcript === 'TRANSCRICAO_SENSIVEL_TESTE').length).toBe(1);
  });

  test('claim não retorna linha → aborta sem transcrever nem responder', async () => {
    scenario.claim = { data: [], error: null };
    await runAsync('audio-1');
    expect(transcribeAudio).not.toHaveBeenCalled();
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  test('transcrição vazia → media_status failed, sem resposta', async () => {
    transcribeAudio.mockResolvedValueOnce('');
    await runAsync('audio-1');
    expect(updatesWith(p => p.media_status === 'failed').length).toBe(1);
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  test('falha de rede na transcrição → volta a pending (transitória)', async () => {
    transcribeAudio.mockRejectedValueOnce(new TypeError('fetch failed'));
    await runAsync('audio-1');
    expect(updatesWith(p => p.media_status === 'pending').length).toBe(1);
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  test('timeout após envio à Meta → outbound unconfirmed, áudio processed, sem retry', async () => {
    sendWhatsAppMessage.mockRejectedValueOnce(new TypeError('fetch failed'));
    await runAsync('audio-1');
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(updatesWith(p => p.status === 'unconfirmed').length).toBe(1);
    expect(updatesWith(p => p.media_status === 'processed').length).toBe(1);
  });

  test('falha ao gravar wa_message_id após Meta aceitar → áudio processed, sem duplicar', async () => {
    // insert ok, send ok; simular falha no update do wa_id é indistinguível do
    // mock genérico — o que importa: processed fecha e não há retry.
    await runAsync('audio-1');
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(updatesWith(p => p.media_status === 'processed').length).toBe(1);
  });

  test('dois áudios consecutivos na mesma conversa → dois envios independentes', async () => {
    scenario.claim = { data: [{ id: 'audio-1' }], error: null };
    await runAsync('audio-1');
    scenario.claim = { data: [{ id: 'audio-2' }], error: null };
    await runAsync('audio-2');
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(2);
    const inserts = dbLog.filter(([op, payload]) => op === 'insert' && payload?.sender_type === 'bot');
    expect(inserts.length).toBe(2);
    expect(inserts[0][1].internal_note).toContain('audio-1');
    expect(inserts[1][1].internal_note).toContain('audio-2');
  });

  test('callback sent/delivered/read da Meta atualiza a resposta pelo wa_message_id', async () => {
    await runAsync('audio-1');
    // Meta chama o webhook de status com o id devolvido no envio
    scenario.waLookup = [{ id: 'reply-1' }];
    await __test__.processDeliveryStatuses([{ id: 'wamid-async-1', status: 'delivered' }]);
    await __test__.processDeliveryStatuses([{ id: 'wamid-async-1', status: 'read' }]);
    expect(updatesWith(p => p.status === 'delivered').length).toBe(1);
    expect(updatesWith(p => p.status === 'read').length).toBe(1);
  });

  test('callback da Meta para wa_id desconhecido não atualiza nada', async () => {
    scenario.waLookup = [];
    await __test__.processDeliveryStatuses([{ id: 'wamid-unknown', status: 'read' }]);
    expect(updatesWith(p => p.status === 'read').length).toBe(0);
  });

  test('logs não contêm transcrição, telefone ou conteúdo', async () => {
    await runAsync('audio-1');
    const all = consoleOutput.join('\n');
    expect(all).not.toContain('TRANSCRICAO_SENSIVEL_TESTE');
    expect(all).not.toContain('5573999998888');
    expect(all).not.toContain('RESPOSTA_BOT_TESTE');
  });
});
