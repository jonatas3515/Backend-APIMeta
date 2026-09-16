import { getClientTitle, getClientGreeting, getGenderFromName } from '../lib/genderFromName';

describe('genderFromName', () => {
  describe('nomes ambíguos e raros', () => {
    test.each([
      'Alex', 'Ariel', 'Cris', 'Dani', 'Jean', 'Kim', 'Manu', 'Michel', 'Rafa',
      'Sam', 'Sasha', 'Sidney', 'Taylor', 'Yuri',
      'Andrea', 'Nicola', 'Luca',
      'Félix', 'Anaís', 'Artemis', 'Dolores', 'Inês', 'Íris', 'Ísis', 'Janis',
      'Liz', 'Lourdes', 'Mercedes', 'Taís',
      'Bellatrix', 'Fênix', 'Margaux', 'Nyx', 'Pax', 'Trix',
      'Cruz', 'Luz', 'Paz', 'Mariluz',
      'Alison', 'Darcy', 'Dominique', 'Duda', 'Eden', 'Francis', 'Jaci',
      'Juraci', 'Robin',
      'Hendrix', 'Knox', 'Lennox', 'Max', 'Rex', 'Aziz', 'Diniz', 'Luiz',
      'Ruiz', 'Tomaz', 'Andy', 'Anthony', 'Billy', 'Danny', 'Henry', 'Johnny',
      'Tony', 'Wesley'
    ])('%s não gera título de gênero', (name) => {
      expect(getClientTitle(name)).toBeNull();
      expect(getGenderFromName(name)).toBeNull();
    });
  });

  describe('nomes com sinais claros no português', () => {
    test.each([
      ['Maria', 'senhora'],
      ['João', 'senhor'],
      ['Ana', 'senhora'],
      ['Carlos', 'senhor'],
      ['Emanuelly', 'senhora'],
      ['Jhon', 'senhor']
    ])('%s => %s', (name, expected) => {
      expect(getClientTitle(name)).toBe(expected);
    });
  });

  describe('getClientGreeting', () => {
    test('nome ambíguro usa apenas o primeiro nome', () => {
      expect(getClientGreeting('Alex Costa')).toBe('Alex');
    });

    test('nome conhecido usa título + primeiro nome', () => {
      expect(getClientGreeting('João da Silva')).toBe('Senhor João');
      expect(getClientGreeting('Maria das Graças')).toBe('Senhora Maria');
    });

    test('nome ausente retorna "Olá"', () => {
      expect(getClientGreeting('')).toBe('Olá');
      expect(getClientGreeting('Cliente')).toBe('Olá');
      expect(getClientGreeting(null)).toBe('Olá');
    });

    test('acentos e caixa são normalizados', () => {
      expect(getClientGreeting('Sasha')).toBe('Sasha');
      expect(getClientTitle('Sasha')).toBeNull();
    });

    test('apelido não é usado como prova', () => {
      expect(getClientTitle('Duda')).toBeNull();
      expect(getClientGreeting('Duda')).toBe('Duda');
    });
  });
});
