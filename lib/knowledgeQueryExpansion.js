/**
 * Expansão determinística e controlada de consultas para o RAG jurídico.
 *
 * Regras:
 * - Nunca substitui a consulta original; apenas adiciona termos técnicos.
 * - Usa apenas um mapa estático de expressões leigas -> termos jurídicos.
 * - Não adiciona stopwords nem termos genéricos isolados (ex.: "direito", "ação").
 * - Preserva a consulta original para logs e exibição ao usuário.
 * - Limita o número de termos adicionados para evitar ruído.
 */

const STOPWORDS = new Set([
  'a','o','as','os','um','uma','uns','umas','de','da','do','das','dos','e','em','no','na','nos','nas','por','para','com','como','mais','menos','muito','pouco','se','sem','sob','sobre','entre','ate','antes','depois','durante','so','que','quem','qual','quais','cujo','cuja','este','esta','estes','estas','esse','essa','esses','essas','aquele','aquela','aqueles','aquelas','isto','isso','aquilo','meu','minha','meus','minhas','teu','tua','teus','tuas','seu','sua','seus','suas','nosso','nossa','nossos','nossas','me','mim','te','ti','ele','ela','eles','elas','nos','vos','lhes','lhe','la','aqui','agora','hoje','ontem','amanha','ja','ainda','so','somente','talvez','deve','dever','deveria','pode','poder','posso','ser','estar','ter','haver','fazer','dar','dizer','ver','ir','vir','sair','chegar','ficar','passar','voltar','entrar','comecar','acabar','terminar','continuar','parecer','achar','sendo','sido','gere','gerar','rascunho','inicial','peticao','petição','dê','me','nos','favor','obrigado','obrigada','fico','grato','gostaria','poderia','pode','faca','faz','diga','meu','minha','nossa','sua','qualquer','todos','todas','todo','toda','cada','tanto','tanta','sempre','nunca','jamais','nem','tambem','ou','mas','porem','contudo','entretanto','logo','portanto','assim','pois','porque','porquê','quando','onde','quanto','quantos','exemplo','tipo','dessa','desse','daquele','disto','disso','daquilo','nele','nela','dele','dela','pro','pra','pros','pras'
]);

const PHRASE_MAP = {
  'fui demitido': ['demissao', 'rescisao', 'trabalhista'],
  'fui demitida': ['demissao', 'rescisao', 'trabalhista'],
  'demitido sem receber': ['verbas rescisorias', 'salario atrasado'],
  'demitida sem receber': ['verbas rescisorias', 'salario atrasado'],
  'nao recebi meus direitos': ['verbas rescisorias', 'direitos trabalhistas'],
  'não recebi meus direitos': ['verbas rescisorias', 'direitos trabalhistas'],
  'me cobraram indevidamente': ['cobranca indevida', 'relacao de consumo'],
  'empresa nao pagou': ['inadimplemento', 'pagamento', 'salario'],
  'empresa não pagou': ['inadimplemento', 'pagamento', 'salario'],
  'quero processar': ['acao', 'reclamacao'],
  'patrao nao pagou': ['inadimplemento', 'pagamento', 'salario'],
  'patrão não pagou': ['inadimplemento', 'pagamento', 'salario'],
  'meu patrao': ['empregador', 'empregado'],
  'meu patrão': ['empregador', 'empregado']
};

const WORD_MAP = {
  'demitido': 'demissao',
  'demitida': 'demissao',
  'receber': 'recebimento',
  'cobraram': 'cobranca indevida',
  'indevidamente': 'cobranca indevida',
  'processar': 'acao',
  'processo': null,
  'lei': null,
  'direito': null
};

const MAX_EXTRA_WORDS = 8;

function cleanText(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return cleanText(text)
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Expande a consulta original com termos jurídicos determinísticos.
 * @param {string} query - consulta bruta do usuário
 * @returns {string} - consulta expandida sem destruir o original
 */
export function expandQuery(query) {
  if (!query || query.trim().length < 3) return query || '';

  const original = cleanText(query);
  const expansion = new Set();
  const originalTokens = new Set(tokenize(original));

  // Expansão de frases (preferencial)
  for (const [phrase, terms] of Object.entries(PHRASE_MAP)) {
    if (original.includes(phrase)) {
      for (const term of terms) {
        if (!originalTokens.has(term)) {
          expansion.add(term);
        }
      }
    }
  }

  // Expansão de palavras somente quando o contexto é frase conhecida
  const tokens = tokenize(original);
  for (const token of tokens) {
    const mapped = WORD_MAP[token];
    if (mapped && !originalTokens.has(mapped)) {
      expansion.add(mapped);
    }
  }

  if (expansion.size === 0) return original;

  const extra = [];
  let extraWords = 0;
  for (const term of expansion) {
    if (!STOPWORDS.has(term) && term.length >= 3) {
      const wordCount = term.split(/\s+/).length;
      if (extraWords + wordCount > MAX_EXTRA_WORDS) break;
      extra.push(term);
      extraWords += wordCount;
    }
  }

  return [original, ...extra].join(' ');
}
