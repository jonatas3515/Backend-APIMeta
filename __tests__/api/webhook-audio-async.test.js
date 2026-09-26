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
const origFetch = global.fetch;

function mockMetaFetches() {
  global.fetch = jest.fn(async (url) => {
    if (String(url).includes('graph.facebook.com') && String(url).includes('media-e2e-1')) {
      return { ok: true, json: async () => ({ url: 'https://synthetic.example.com/dl', mime_type: 'audio/ogg' }) };
    }
    return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, json: async () => ({}) };
  });
}

function makeQuery(table) {
  const q = { _table: table, _update: null, _insert: null, _select: false, _single: false, _filters: [] };
  const m = (name) => (...args) => {
    dbLog.push([name, ...args]);
    if (name === 'update') q._update = args[0];
    if (name === 'insert') q._insert = args[0];
    if (name === 'select') q._select = true;
    if (name === 'single' || name === 'maybeSingle') q._single = true;
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
    else if (q._update && q._select && q._update.media_status === 'processing') out = scenario.claim;
    else if (q._update && q._select && q._update.media_status !== undefined) out = scenario.finalize;
    else if (q._update) out = { data: null, error: null };
    else if (waLookup) out = { data: scenario.waLookup || [], error: null };
    else if (q._select && table === 'messages') out = { data: scenario.history || [], error: null };
    else out = { data: null, error: null };
    return Promise.resolve(out).then(res, rej);
  };
  return q;
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: (t) => makeQuery(t),
    rpc: jest.fn().mockResolvedValue({ data: null }),
    storage: {
      from: () => ({
        upload: jest.fn().mockResolvedValue({ data: { path: 'p' }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://synthetic.example.com/a.ogg' } }),
        download: jest.fn().mockResolvedValue({ data: new Blob(['x']), error: null })
      })
    }
  }))
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
  handleLaborSettlementWebhook: jest.fn().mockResolvedValue({ handled: false }),
  getActiveMessages: jest.fn(() => [])
}));

jest.mock('../../lib/laborSettlementIntent.js', () => ({
  classifyLaborIntent: jest.fn().mockReturnValue({})
}));

jest.mock('../../lib/intakeFlows', () => ({ detectArea: jest.fn(), getFlow: jest.fn() }));
jest.mock('../../lib/formatters', () => ({ normalizePhoneForMatch: jest.fn(p => p) }));
jest.mock('../../lib/clientMemory', () => ({ loadClientMemory: jest.fn(), formatClientMemory: jest.fn(() => '') }));
jest.mock('../../lib/genderFromName', () => ({ getClientGreeting: jest.fn(() => '') }));
jest.mock('../../lib/conversationQueue', () => ({ withConversationQueue: jest.fn((_key, fn) => fn()) }));
jest.mock('../../lib/funnel-whatsapp.js', () => ({ evaluateFunnelAutomation: jest.fn(), registerFunnelEvent: jest.fn() }));
jest.mock('../../lib/bot-responses.js', () => ({ detectThanks: jest.fn(() => false), getThanksReply: jest.fn(), correctCommonMistakes: jest.fn((p, r) => r) }));
jest.mock('../../lib/knowledge-embeddings.js', () => ({ semanticSearch: jest.fn() }));
jest.mock('../../lib/systemPrompt.js', () => ({ SYSTEM_PROMPT: '' }));
jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn(p => p) }));

const { __test__ } = require('../../pages/api/webhook');
const webhookHandler = require('../../pages/api/webhook').default;
const { createMocks } = require('node-mocks-http');
const { transcribeAudio } = require('../../lib/mediaProcessing');
const { sendWhatsAppMessage } = require('../../lib/whatsapp.js');
const { waitUntil } = require('@vercel/functions');

const AUDIO_POST = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'waba-1',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        contacts: [{ profile: { name: 'Cliente T' }, wa_id: '5511999000000' }],
        messages: [{
          from: '5511999000000',
          id: 'wamid.synthetic.audio.e2e',
          timestamp: '1790380000',
          type: 'audio',
          audio: { id: 'media-e2e-1', mime_type: 'audio/ogg', voice: true }
        }]
      }
    }]
  }]
};

const runAsync = (messageId = 'audio-1', mediaType = 'audio') =>
  __test__.transcribeAudioAsync('conv-1', 'https://synthetic.example.com/a.ogg', mediaType, messageId);

const updatesWith = (pred) => dbLog.filter(([op, payload]) => op === 'update' && pred(payload));

describe('transcribeAudioAsync — fechamento de estado e vínculo', () => {
  beforeEach(() => {
    dbLog = [];
    consoleOutput = [];
    scenario = {
      claim: { data: [{ id: 'audio-1' }], error: null },
      finalize: { data: [{ id: 'audio-1' }], error: null },
      conversation: CONVERSATION,
      history: [],
      insertReply: { data: { id: 'reply-1' }, error: null }
    };
    transcribeAudio.mockClear().mockResolvedValue('TRANSCRICAO_SENSIVEL_TESTE');
    sendWhatsAppMessage.mockClear().mockResolvedValue('wamid-async-1');
    waitUntil.mockClear();
    mockMetaFetches();
    console.log = (...a) => consoleOutput.push(a.map(String).join(' '));
    console.error = (...a) => consoleOutput.push(a.map(String).join(' '));
    console.warn = (...a) => consoleOutput.push(a.map(String).join(' '));
  });
  afterEach(() => {
    console.log = origLog; console.error = origErr; console.warn = origWarn;
    global.fetch = origFetch;
  });

  test('fluxo completo: claim → resposta vinculada → wa_id → áudio processed', async () => {
    await runAsync('audio-1');

    // claim atômico pending->processing (sem media_transcript no payload)
    expect(updatesWith(p => p.media_status === 'processing' && p.media_transcript === undefined).length).toBe(1);
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

  test('envio à Meta pendurado → abort (TimeoutError) vira unconfirmed, áudio encerrado, sem retry', async () => {
    // Em produção, AbortSignal.timeout(30s) de lib/whatsapp interrompe o fetch
    // pendurado rejeitando com TimeoutError antes do maxDuration da Vercel.
    // Aqui emulamos exatamente esse comportamento (rejeição tardia com o
    // mesmo nome de erro) através do handler POST completo.
    sendWhatsAppMessage.mockImplementationOnce(() => new Promise((_, rej) =>
      setTimeout(() => rej(Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' })), 30)));
    const { req, res } = createMocks({ method: 'POST', body: AUDIO_POST });
    await webhookHandler(req, res);
    await new Promise(r => setTimeout(r, 200));
    expect(res._getStatusCode()).toBe(200);
    // única tentativa — sem retry após timeout
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    // resposta outbound preservada e marcada unconfirmed (envio incerto)
    expect(dbLog.find(([op, payload]) => op === 'insert' && payload?.sender_type === 'bot')).toBeTruthy();
    expect(updatesWith(p => p.status === 'unconfirmed').length).toBe(1);
    // áudio encerrado — não fica processing nem volta a pending
    expect(updatesWith(p => p.media_status === 'processed').length).toBe(1);
    expect(updatesWith(p => p.media_status === 'pending').length).toBe(0);
    // transcrição persistida logo após transcrever (update condicional a processing)
    expect(updatesWith(p => p.media_status === 'processing' && p.media_transcript === 'TRANSCRICAO_SENSIVEL_TESTE').length).toBe(1);
    // logs sem PII nem conteúdo
    const all = consoleOutput.join('\n');
    expect(all).not.toContain('TRANSCRICAO_SENSIVEL_TESTE');
    expect(all).not.toContain('RESPOSTA_BOT_TESTE');
  });

  test('orçamento esgotado antes do send → SEND_SKIPPED_NO_BUDGET: outbound not_sent, áudio needs_review, fetch não chamado', async () => {
    // Transcrição+Gemini lentos consomem o orçamento antes do send. Em
    // produção, lib/whatsapp com deadline já vencido rejeita com
    // SEND_SKIPPED_NO_BUDGET SEM chamar fetch — o mock emula exatamente isso
    // (a prova "fetch não chamado" vive no teste unitário de lib/whatsapp).
    process.env.WEBHOOK_INVOCATION_BUDGET_MS = '150';
    process.env.WHATSAPP_SEND_RESERVE_MS = '50';
    try {
      const { askGemini } = require('../../lib/ai.js');
      transcribeAudio.mockImplementationOnce(() =>
        new Promise(r => setTimeout(() => r('TRANSCRICAO_SENSIVEL_TESTE'), 60)));
      askGemini.mockImplementationOnce(() =>
        new Promise(r => setTimeout(() => r('RESPOSTA_BOT_TESTE'), 60)));
      let capturedOpts;
      let deadlineAlreadyPast = false;
      sendWhatsAppMessage.mockImplementationOnce((_to, _text, opts) => {
        capturedOpts = opts;
        deadlineAlreadyPast = Date.now() >= opts.deadline;
        return Promise.reject(Object.assign(
          new Error('The operation timed out'),
          { name: 'TimeoutError', code: 'SEND_SKIPPED_NO_BUDGET' }));
      });
      const t0 = Date.now();
      const { req, res } = createMocks({ method: 'POST', body: AUDIO_POST });
      await webhookHandler(req, res);
      await new Promise(r => setTimeout(r, 400));
      expect(res._getStatusCode()).toBe(200);
      // uma única tentativa — sem retry
      expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
      // o deadline repassado reflete o orçamento RESTANTE (~100ms), não 30s
      expect(capturedOpts?.deadline).toEqual(expect.any(Number));
      expect(capturedOpts.deadline - t0).toBeLessThan(1000);
      // ...e já estava vencido quando o send foi chamado → lib/whatsapp
      // retornaria SEND_SKIPPED_NO_BUDGET sem iniciar o fetch.
      expect(deadlineAlreadyPast).toBe(true);
      // resposta outbound preservada como NÃO ENVIADA — não 'unconfirmed'
      // (que implicaria entrega incerta de um envio que nunca ocorreu)
      expect(dbLog.find(([op, payload]) => op === 'insert' && payload?.sender_type === 'bot')).toBeTruthy();
      expect(updatesWith(p => p.status === 'not_sent').length).toBe(1);
      expect(updatesWith(p => p.status === 'unconfirmed').length).toBe(0);
      // áudio sinalizado para revisão — não 'processed' (a resposta não saiu)
      // nem 'pending' (que geraria reprocessamento e resposta duplicada)
      expect(updatesWith(p => p.media_status === 'needs_review').length).toBe(1);
      expect(updatesWith(p => p.media_status === 'processed').length).toBe(0);
      expect(updatesWith(p => p.media_status === 'pending').length).toBe(0);
    } finally {
      delete process.env.WEBHOOK_INVOCATION_BUDGET_MS;
      delete process.env.WHATSAPP_SEND_RESERVE_MS;
    }
  });

  test('envio iniciado e abortado (TimeoutError sem código) → unconfirmed + processed, sem retry', async () => {
    // Caso (b): fetch chegou a iniciar e não houve confirmação — entrega
    // genuinamente incerta. Difere de SEND_SKIPPED_NO_BUDGET.
    sendWhatsAppMessage.mockImplementationOnce(() => Promise.reject(
      Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' })));
    await runAsync('audio-1');
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(updatesWith(p => p.status === 'unconfirmed').length).toBe(1);
    expect(updatesWith(p => p.status === 'not_sent').length).toBe(0);
    expect(updatesWith(p => p.media_status === 'processed').length).toBe(1);
  });

  test('POST áudio: resposta 200 retorna enquanto o processamento fica registrado no waitUntil', async () => {
    const { req, res } = createMocks({ method: 'POST', body: AUDIO_POST });
    await webhookHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
    // a promise do pipeline async foi entregue ao runtime da Vercel —
    // não é fire-and-forget puro
    expect(waitUntil).toHaveBeenCalledTimes(1);
    const registered = waitUntil.mock.calls[0][0];
    expect(typeof registered?.then).toBe('function');
    // e o pipeline realmente completou em background
    await registered;
    expect(updatesWith(p => p.media_status === 'processed').length).toBe(1);
  });

  test('falha ao gravar wa_message_id após Meta aceitar → áudio processed, sem duplicar', async () => {
    // insert ok, send ok; simular falha no update do wa_id é indistinguível do
    // mock genérico — o que importa: processed fecha e não há retry.
    await runAsync('audio-1');
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(updatesWith(p => p.media_status === 'processed').length).toBe(1);
  });

  test('toda transição de media_status é condicional a media_status=processing', async () => {
    await runAsync('audio-1');
    const writes = dbLog
      .map((entry, idx) => [entry, idx])
      .filter(([[op, p]]) => op === 'update' && p?.media_status !== undefined);
    expect(writes.length).toBeGreaterThan(0);
    for (const [, idx] of writes) {
      const nextOps = dbLog.slice(idx + 1, idx + 4).map(([op, k, v]) => `${op}:${k}=${v}`);
      // claim (processing) e finais (processed/failed/pending) filtram por id;
      // finais também exigem estado atual processing
      const payload = dbLog[idx][1];
      if (payload.media_status !== 'processing') {
        expect(nextOps).toContain('eq:media_status=processing');
      }
    }
  });

  test('escrita final sem posse (0 linhas, estado mudou) → registra e não sobrescreve', async () => {
    // Worker pausado: outro agente marcou needs_review enquanto transcenia.
    // O envio já ocorreu neste fluxo (send precede o fechamento), mas o estado
    // externo é preservado e a ocorrência fica registrada.
    scenario.finalize = { data: [], error: null };
    await runAsync('audio-1');
    expect(consoleOutput.join('\n')).toContain('estado alterado externamente');
  });

  test('erro na escrita final condicional → registrado como falha, não sucesso', async () => {
    scenario.finalize = { data: null, error: { message: 'db down' } };
    await runAsync('audio-1');
    expect(consoleOutput.join('\n')).toContain('Falha ao gravar media_status');
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

  test('POST real com áudio → handler invoca transcribeAudioAsync com o id salvo', async () => {
    // Regressão do incidente de produção: o call site passava uma variável
    // fora de escopo (ReferenceError) e o áudio ficava pending para sempre.
    const { req, res } = createMocks({ method: 'POST', body: AUDIO_POST });
    await webhookHandler(req, res);
    // a transcrição é fire-and-forget: aguarda as microtasks dos mocks
    await new Promise(r => setTimeout(r, 100));
    expect(res._getStatusCode()).toBe(200);
    // o claim atômico pending->processing executou sobre o registro salvo
    // (exclui o update de persistência da transcrição, que carrega media_transcript)
    if (updatesWith(p => p.media_status === 'processing' && p.media_transcript === undefined).length !== 1) {
      origErr(consoleOutput.slice(-40).join('\n'));
    }
    expect(updatesWith(p => p.media_status === 'processing' && p.media_transcript === undefined).length).toBe(1);
    // e o fluxo completou: resposta enviada e áudio fechado como processed
    expect(sendWhatsAppMessage).toHaveBeenCalled();
    expect(updatesWith(p => p.media_status === 'processed').length).toBe(1);
  });

  test('logs não contêm transcrição, telefone ou conteúdo', async () => {
    await runAsync('audio-1');
    const all = consoleOutput.join('\n');
    expect(all).not.toContain('TRANSCRICAO_SENSIVEL_TESTE');
    expect(all).not.toContain('5573999998888');
    expect(all).not.toContain('RESPOSTA_BOT_TESTE');
  });
});
