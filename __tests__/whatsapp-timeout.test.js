/**
 * @jest-environment node
 *
 * lib/whatsapp — timeout capturável no ENVIO de mensagens.
 * Regressão do incidente de produção: fetch sem signal pendurava até o
 * maxDuration da Vercel matar a lambda, deixando resposta em 'pending'
 * e áudio em 'processing' sem nenhum estado final gravado.
 */

process.env.WHATSAPP_TOKEN = 'MOCK-token';

const { sendWhatsAppMessage, sendWhatsAppMediaMessage, uploadMediaToWhatsApp } = require('../lib/whatsapp');

const origFetch = global.fetch;
const origTimeout = process.env.WHATSAPP_SEND_TIMEOUT_MS;

// fetch que nunca resolve por conta própria: só rejeita quando o
// AbortSignal do chamador dispara — exatamente o hang observado na Meta.
const hangingFetch = () => jest.fn((_url, opts) => new Promise((_res, rej) => {
  opts.signal.addEventListener('abort', () => rej(opts.signal.reason));
}));

beforeEach(() => {
  process.env.WHATSAPP_SEND_TIMEOUT_MS = '60';
});

afterEach(() => {
  global.fetch = origFetch;
});

afterAll(() => {
  if (origTimeout === undefined) delete process.env.WHATSAPP_SEND_TIMEOUT_MS;
  else process.env.WHATSAPP_SEND_TIMEOUT_MS = origTimeout;
});

test('sendWhatsAppMessage: fetch pendurado aborta com TimeoutError, sem retry', async () => {
  global.fetch = hangingFetch();
  await expect(sendWhatsAppMessage('5573***0000', 'oi'))
    .rejects.toMatchObject({ name: 'TimeoutError' });
  expect(global.fetch).toHaveBeenCalledTimes(1); // sem retry interno
  const opts = global.fetch.mock.calls[0][1];
  expect(opts.signal).toBeInstanceOf(AbortSignal);
  expect(opts.signal.aborted).toBe(true);
});

test('sendWhatsAppMediaMessage: mesmo timeout capturável', async () => {
  global.fetch = hangingFetch();
  await expect(sendWhatsAppMediaMessage('5573***0000', 'media-id-1', 'audio'))
    .rejects.toMatchObject({ name: 'TimeoutError' });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('envio com resposta rápida retorna o message id da Meta', async () => {
  global.fetch = jest.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    json: async () => ({ messages: [{ id: 'wamid.mock.ok' }] }),
    text: async () => ''
  }));
  await expect(sendWhatsAppMessage('5573***0000', 'oi')).resolves.toBe('wamid.mock.ok');
});

test('erro HTTP da Meta continua rejeitando (caminho de catch existente)', async () => {
  global.fetch = jest.fn(async () => ({
    ok: false, status: 500, statusText: 'Internal',
    json: async () => ({}), text: async () => 'err'
  }));
  await expect(sendWhatsAppMessage('5573***0000', 'oi')).rejects.toThrow('500');
});

test('deadline do chamador limita o timeout ao tempo restante da invocação', async () => {
  process.env.WHATSAPP_SEND_TIMEOUT_MS = '30000';
  global.fetch = hangingFetch();
  const t0 = Date.now();
  await expect(sendWhatsAppMessage('5573***0000', 'oi', { deadline: t0 + 50 }))
    .rejects.toMatchObject({ name: 'TimeoutError' });
  // abortou no deadline (~50ms), não no timeout fixo de 30s
  expect(Date.now() - t0).toBeLessThan(5000);
});

test('sem orçamento restante → nem inicia o fetch à Meta', async () => {
  process.env.WHATSAPP_SEND_TIMEOUT_MS = '30000';
  global.fetch = hangingFetch();
  // Código dedicado permite ao chamador distinguir "não tentado" de
  // "iniciado sem confirmação" — nunca deve ser classificado como unconfirmed.
  await expect(sendWhatsAppMessage('5573***0000', 'oi', { deadline: Date.now() - 1 }))
    .rejects.toMatchObject({ name: 'TimeoutError', code: 'SEND_SKIPPED_NO_BUDGET' });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('fetch iniciado e abortado NÃO recebe o código de skip', async () => {
  process.env.WHATSAPP_SEND_TIMEOUT_MS = '60';
  global.fetch = hangingFetch();
  // O TimeoutError do abort real tem code numérico (DOMException), nunca a
  // string SEND_SKIPPED_NO_BUDGET — o chamador distingue os dois casos.
  const err = await sendWhatsAppMessage('5573***0000', 'oi', { deadline: Date.now() + 40 })
    .then(() => null, e => e);
  expect(err).toMatchObject({ name: 'TimeoutError' });
  expect(err.code).not.toBe('SEND_SKIPPED_NO_BUDGET');
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('deadline também aplica a sendWhatsAppMediaMessage', async () => {
  global.fetch = hangingFetch();
  await expect(sendWhatsAppMediaMessage('5573***0000', 'media-id-1', 'audio', '', '', { deadline: Date.now() - 1 }))
    .rejects.toMatchObject({ name: 'TimeoutError' });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('WHATSAPP_SEND_TIMEOUT_MS inválida não desativa o timeout', async () => {
  process.env.WHATSAPP_SEND_TIMEOUT_MS = 'abc';
  global.fetch = hangingFetch();
  // env inválida → default 30s; deadline de 50ms prova que o timeout existe
  await expect(sendWhatsAppMessage('5573***0000', 'oi', { deadline: Date.now() + 50 }))
    .rejects.toMatchObject({ name: 'TimeoutError' });
});

test('WHATSAPP_SEND_TIMEOUT_MS negativa/zero cai no default (não quebra o signal)', async () => {
  process.env.WHATSAPP_SEND_TIMEOUT_MS = '-5';
  global.fetch = hangingFetch();
  await expect(sendWhatsAppMessage('5573***0000', 'oi', { deadline: Date.now() + 50 }))
    .rejects.toMatchObject({ name: 'TimeoutError' });
  process.env.WHATSAPP_SEND_TIMEOUT_MS = '0';
  await expect(sendWhatsAppMessage('5573***0000', 'oi', { deadline: Date.now() + 50 }))
    .rejects.toMatchObject({ name: 'TimeoutError' });
});

test('upload de mídia NÃO recebe timeout (apenas envio de mensagens)', async () => {
  global.fetch = jest.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    json: async () => ({ id: 'media-1' }),
    text: async () => ''
  }));
  await uploadMediaToWhatsApp(Buffer.from('x'), 'audio/ogg');
  const opts = global.fetch.mock.calls[0][1];
  expect(opts.signal).toBeUndefined();
});
