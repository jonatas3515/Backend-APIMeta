import { expandQuery } from '../../lib/knowledgeQueryExpansion';

describe('knowledgeQueryExpansion', () => {
  it('preserva consulta original sem alterar o sentido', () => {
    const query = 'rescisão indireta trabalhista';
    const expanded = expandQuery(query);
    expect(expanded).toContain('rescisao');
    expect(expanded).toContain('indireta');
    expect(expanded).toContain('trabalhista');
  });

  it('normaliza acentos e caixa', () => {
    const query = 'Rescisão Indireta Trabalhista';
    const expanded = expandQuery(query);
    expect(expanded.toLowerCase()).toContain('rescisao');
    expect(expanded.toLowerCase()).toContain('indireta');
    expect(expanded.toLowerCase()).toContain('trabalhista');
  });

  it('expande "fui demitido sem receber" para termos trabalhistas', () => {
    const query = 'fui demitido sem receber';
    const expanded = expandQuery(query);
    expect(expanded).toContain('demissao');
    expect(expanded).toContain('rescisao');
    expect(expanded).toContain('trabalhista');
    expect(expanded).toContain('verbas rescisorias');
    expect(expanded).toContain('salario atrasado');
  });

  it('expande "me cobraram indevidamente" para cobrança indevida', () => {
    const query = 'me cobraram indevidamente';
    const expanded = expandQuery(query);
    expect(expanded).toContain('cobranca indevida');
    expect(expanded).toContain('relacao de consumo');
  });

  it('não gera expansão artificial para consulta desconhecida', () => {
    const query = 'como regar orquídeas';
    const expanded = expandQuery(query);
    expect(expanded).toBe('como regar orquideas');
  });

  it('não adiciona termos genéricos isolados', () => {
    const query = 'direito';
    const expanded = expandQuery(query);
    expect(expanded).toBe('direito');
  });

  it('não adiciona stopwords extra', () => {
    const query = 'fui demitido';
    const expanded = expandQuery(query);
    const words = expanded.split(/\s+/);
    const stopwords = ['a', 'o', 'de', 'e', 'para', 'por'];
    for (const word of words) {
      expect(stopwords).not.toContain(word);
    }
  });

  it('limite de palavras adicionadas', () => {
    const query = 'fui demitido sem receber e quero processar';
    const expanded = expandQuery(query);
    const words = expanded.split(/\s+/);
    const original = ['fui', 'demitido', 'sem', 'receber', 'e', 'quero', 'processar'];
    const added = words.filter(w => !original.includes(w));
    expect(added.length).toBeLessThanOrEqual(8);
  });
});
