const { getErrorMessage } = require('../lib/errorMessage');

describe('getErrorMessage', () => {
  test('prioriza response.data.error', () => {
    const error = { response: { data: { error: 'Permissao negada' } } };
    expect(getErrorMessage(error)).toBe('Permissao negada');
  });

  test('fallback para response.data.message', () => {
    const error = { response: { data: { message: 'Recurso nao encontrado' } } };
    expect(getErrorMessage(error)).toBe('Recurso nao encontrado');
  });

  test('rejeita mensagens que expoem URL', () => {
    const error = { message: 'Falha em https://api.exemplo.com/secret' };
    expect(getErrorMessage(error, 'Erro generico')).toBe('Erro generico');
  });

  test('rejeita mensagens muito longas', () => {
    const error = { message: 'x'.repeat(200) };
    expect(getErrorMessage(error, 'Erro generico')).toBe('Erro generico');
  });

  test('retorna fallback para erro nulo', () => {
    expect(getErrorMessage(null, 'Erro generico')).toBe('Erro generico');
  });
});
