import {
  getGreeting,
  detectThanks,
  detectGreeting,
  detectAgreement,
  getThanksReply,
  getAcknowledgementReply,
  getToneInstructions,
  correctCommonMistakes
} from '../lib/bot-responses';

describe('bot-responses', () => {
  test('detecta agradecimento', () => {
    expect(detectThanks('Obrigada pela ajuda')).toBe(true);
    expect(detectThanks('obg')).toBe(true);
    expect(detectThanks('Vou verificar isso')).toBe(false);
  });

  test('detecta saudação', () => {
    expect(detectGreeting('Bom dia')).toBe(true);
    expect(detectGreeting('Oi, tudo bem?')).toBe(true);
    expect(detectGreeting('Quero processar')).toBe(false);
  });

  test('detecta concordância', () => {
    expect(detectAgreement('ok, entendi')).toBe(true);
    expect(detectAgreement('Não quero')).toBe(false);
  });

  test('getGreeting retorna cumprimento conforme hora', () => {
    const hour = new Date().getHours();
    const greeting = getGreeting();
    expect(['Bom dia', 'Boa tarde', 'Boa noite']).toContain(greeting);
  });

  test('getThanksReply retorna resposta de agradecimento', () => {
    const reply = getThanksReply();
    expect(reply).toMatch(/De nada|Por nada|Ficamos felizes|à disposição/);
  });

  test('getAcknowledgementReply retorna resposta de concordância', () => {
    const reply = getAcknowledgementReply();
    expect(reply).toMatch(/Entendido|Perfeito|Certo/);
  });

  test('getToneInstructions contém regras de linguagem', () => {
    const instructions = getToneInstructions();
    expect(instructions).toContain('De nada');
    expect(instructions).toContain('NUNCA responda apenas "Entendi"');
  });

  test('correctCommonMistakes corrige "Entendi" após agradecimento', () => {
    const result = correctCommonMistakes('Obrigada', 'Entendi.');
    expect(result).toMatch(/De nada|Por nada|Ficamos felizes|à disposição/);
  });

  test('correctCommonMistakes mantém resposta quando não é agradecimento', () => {
    const result = correctCommonMistakes('Qual o prazo?', 'O prazo é de 30 dias.');
    expect(result).toBe('O prazo é de 30 dias.');
  });
});
