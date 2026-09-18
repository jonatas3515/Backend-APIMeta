const { triagePrevidenciario, extractFacts, shouldHandoff, chooseQuestion, detectTheme } = require('../../lib/previdenciarioTriage');

describe('Previdenciário - triagem contextual', () => {
  test('Quero me aposentar → pergunta tempo de contribuição', () => {
    const { reply, handoff, facts } = triagePrevidenciario('Quero me aposentar.');
    expect(handoff).toBe(false);
    expect(facts.theme).toBe('aposentadoria');
    expect(reply).toMatch(/h[aá] quanto tempo/i);
  });

  test('Meu benefício foi negado → pergunta benefício e data', () => {
    const { reply, handoff, facts } = triagePrevidenciario('Meu benefício foi negado.');
    expect(handoff).toBe(false);
    expect(facts.benefit_denied).toBe(true);
    expect(reply).toMatch(/qual benef[ií]cio.*negado.*quando/i);
  });

  test('Tenho prazo para recorrer até sexta → handoff imediato', () => {
    const { reply, handoff, facts } = triagePrevidenciario('Tenho prazo para recorrer até sexta.');
    expect(handoff).toBe(true);
    expect(facts.has_deadline).toBe(true);
    expect(reply).toMatch(/encaminhar.*equipe/i);
  });

  test('Quero pedir BPC para minha mãe → pergunta contextual', () => {
    const { reply, handoff, facts } = triagePrevidenciario('Quero pedir BPC para minha mãe.');
    expect(handoff).toBe(false);
    expect(facts.theme).toBe('bpc_loas');
    expect(reply).toMatch(/m[aã]e.*idade.*deficiência.*pedido.*INSS/i);
  });

  test('Pensão por morte → pergunta dependente sem conflito com família', () => {
    const { reply, handoff, facts } = triagePrevidenciario('Pensão por morte.');
    expect(handoff).toBe(false);
    expect(facts.theme).toBe('pensao_morte');
    expect(reply).toMatch(/c[oô]njuge|companheiro|filho|dependente/i);
    expect(reply).toMatch(/benef[ií]cio.*solicitado/i);
  });

  test('Mensagem sem área clara → pergunta aberta', () => {
    const { reply, handoff, facts } = triagePrevidenciario('Preciso de ajuda com documentos.');
    expect(handoff).toBe(false);
    expect(facts.theme).toBe('geral');
    expect(reply).toMatch(/conte?(-|\s)?me um pouco/i);
  });

  test('Não repete dados já informados', () => {
    const turn1 = triagePrevidenciario('Quero me aposentar. Tenho 65 anos e 30 anos de contribuição.');
    expect(turn1.facts.client_age).toBe(65);
    expect(turn1.facts.contrib_years).toBe(30);
    expect(turn1.reply).not.toMatch(/h[aá] quanto tempo/i);

    const turn2 = triagePrevidenciario('Ainda não fiz o pedido.', turn1.facts);
    expect(turn2.reply).not.toMatch(/idade/i);
    expect(turn2.reply).not.toMatch(/h[aá] quanto tempo/i);
    expect(turn2.reply).toMatch(/encaminhar|equipe/i);
  });

  test('Urgência identifica handoff', () => {
    const { handoff } = triagePrevidenciario('Meu benefício foi negado e tenho 5 dias para recorrer.');
    expect(handoff).toBe(true);
  });

  test('Doença sem perícia → pergunta natural', () => {
    const { reply, handoff } = triagePrevidenciario('Tenho uma doença e não consigo trabalhar.');
    expect(handoff).toBe(false);
    expect(reply).toMatch(/per[ií]cia.*benef[ií]cio/i);
  });

  test('aposentadoria → indeferimento muda a pergunta', () => {
    const turn1 = triagePrevidenciario('Quero me aposentar.');
    expect(turn1.reply).toMatch(/h[aá] quanto tempo/i);

    const turn2 = triagePrevidenciario('Meu benefício foi negado.', turn1.facts);
    expect(turn2.facts.benefit_denied).toBe(true);
    expect(turn2.reply).not.toMatch(/h[aá] quanto tempo/i);
    expect(turn2.reply).toMatch(/qual benef[ií]cio.*negado.*quando/i);
  });

  test('aposentadoria → prazo de recurso gera handoff', () => {
    const turn1 = triagePrevidenciario('Quero me aposentar.');
    const turn2 = triagePrevidenciario('Tenho prazo para recorrer até sexta.', turn1.facts);
    expect(turn2.handoff).toBe(true);
    expect(turn2.reply).toMatch(/encaminhar.*equipe/i);
    expect(turn2.reply).not.toMatch(/h[aá] quanto tempo/i);
  });

  test('Tempo de contribuição → pergunta CNIS/CTPS', () => {
    const { reply } = triagePrevidenciario('Tenho dúvidas sobre meu tempo de contribuição.');
    expect(reply).toMatch(/CNIS|carteira de trabalho/i);
  });

  test('Respostas têm no máximo 3 frases', () => {
    const samples = [
      'Quero me aposentar.',
      'Pensão por morte.',
      'BPC',
      'Auxílio-doença',
      'Revisão de benefício',
      'Meu INSS negou'
    ];
    for (const s of samples) {
      const { reply } = triagePrevidenciario(s);
      const sentences = reply.split(/\?|\.|\n/).filter(Boolean);
      expect(sentences.length).toBeLessThanOrEqual(3);
    }
  });
});
