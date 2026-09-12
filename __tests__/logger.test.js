const { default: logger } = require('../lib/logger');

describe('logger', () => {
  let output;

  beforeEach(() => {
    output = [];
    jest.spyOn(console, 'log').mockImplementation((...args) => output.push(args));
    jest.spyOn(console, 'warn').mockImplementation((...args) => output.push(args));
    jest.spyOn(console, 'error').mockImplementation((...args) => output.push(args));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('emite evento em SCREAMING_SNAKE_CASE', () => {
    logger('info', 'TEST_EVENT', { userId: 'user-1' });
    const entry = JSON.parse(output[0][0]);
    expect(entry.event).toBe('TEST_EVENT');
    expect(entry.level).toBe('info');
  });

  test('redact URLs do contexto', () => {
    logger('error', 'TEST_URL', { userId: 'user-1', error: { message: 'Falha em https://api.exemplo.com/secret' } });
    const entry = JSON.parse(output[0][0]);
    expect(JSON.stringify(entry)).not.toMatch(/https:\/\//);
  });

  test('redact e-mail do contexto', () => {
    logger('error', 'TEST_EMAIL', { userId: 'user-1', error: { message: 'contato@exemplo.com falhou' } });
    const entry = JSON.parse(output[0][0]);
    expect(JSON.stringify(entry)).not.toMatch(/contato@exemplo.com/);
  });

  test('redact CPF e CNPJ do contexto', () => {
    logger('error', 'TEST_CPF', { userId: 'user-1', error: { message: 'CPF 123.456.789-00 e CNPJ 12.345.678/0001-00' } });
    const entry = JSON.parse(output[0][0]);
    expect(JSON.stringify(entry)).not.toMatch(/123\.456\.789-00/);
    expect(JSON.stringify(entry)).not.toMatch(/12\.345\.678/);
  });

  test('nao expoe tokens', () => {
    logger('error', 'TEST_TOKEN', { userId: 'user-1', error: { message: 'Bearer eyJ123abc' } });
    const entry = JSON.parse(output[0][0]);
    expect(JSON.stringify(entry)).not.toMatch(/eyJ123abc/);
  });

  test('truncate mensagens longas', () => {
    const long = 'x'.repeat(250);
    logger('error', 'TEST_LONG', { userId: 'user-1', error: { message: long } });
    const entry = JSON.parse(output[0][0]);
    expect(entry.context.errorCode.length).toBeLessThan(250);
  });

  test('ignora chaves sensiveis', () => {
    logger('info', 'TEST_SENSITIVE', { userId: 'user-1', client_name: 'Jose', client_phone: '11999999999' });
    const entry = JSON.parse(output[0][0]);
    expect(Object.keys(entry.context)).toContain('userId');
    expect(Object.keys(entry.context)).not.toContain('client_name');
    expect(Object.keys(entry.context)).not.toContain('client_phone');
  });
});
