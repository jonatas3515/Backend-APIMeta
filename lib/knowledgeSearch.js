import { supabaseServer } from './supabaseServer';

const STOPWORDS = new Set([
  'a','o','as','os','um','uma','uns','umas','de','da','do','das','dos','e','em','no','na','nos','nas','por','para','com','como','mais','menos','muito','pouco','se','sem','sob','sobre','entre','ate','antes','depois','durante','so','que','quem','qual','quais','cujo','cuja','este','esta','estes','estas','esse','essa','esses','essas','aquele','aquela','aqueles','aquelas','isto','isso','aquilo','meu','minha','meus','minhas','teu','tua','teus','tuas','seu','sua','seus','suas','nosso','nossa','nossos','nossas','me','mim','te','ti','ele','ela','eles','elas','nos','vos','lhes','lhe','lhe','la','aqui','agora','hoje','ontem','amanha','ja','ainda','so','somente','talvez','deve','dever','deveria','pode','poder','posso','ser','estar','ter','haver','fazer','dar','dizer','ver','ir','vir','sair','chegar','ficar','passar','voltar','entrar','comecar','acabar','terminar','continuar','parecer','achar','sendo','sido','gere','gerar','rascunho','inicial','peticao','petição','dê','me','nos','favor','obrigado','obrigada','fico','grato','gostaria','poderia','pode','faca','faz','diga','meu','minha','nossa','sua','qualquer','todos','todas','todo','toda','cada','tanto','tanta','sempre','nunca','jamais','nem','tambem','ou','mas','porem','contudo','entretanto','logo','portanto','assim','pois','porque','porquê','quando','onde','quanto','quantos','exemplo','tipo','dessa','desse','daquele','disto','disso','daquilo','nele','nela','dele','dela','pro','pra','pros','pras'
]);

function cleanText(text) {
  return (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extractKeywords(query) {
  if (!query) return '';
  const normalized = cleanText(query);
  const tokens = normalized.match(/[\p{L}]+/gu) || [];
  const keywords = tokens
    .map(t => t.normalize('NFC'))
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
  if (keywords.length === 0) {
    return query.trim().toLowerCase().replace(/\s+/g, ' ').trim();
  }
  return keywords.join(' or ');
}

export async function searchKnowledge({ query, status = 'aprovado', area = null, tribunal = null, type = null, limit = 8 }) {
  if (!supabaseServer) {
    throw new Error('Cliente Supabase do servidor não configurado');
  }

  const searchQuery = extractKeywords(query);

  const { data, error } = await supabaseServer.rpc('search_knowledge', {
    search_query: searchQuery,
    filter_status: status,
    filter_area: area,
    filter_tribunal: tribunal,
    filter_type: type
  });

  console.log('[RAG] searchKnowledge params:', {
    rawQueryLength: query?.length,
    searchQueryLength: searchQuery?.length,
    status,
    area,
    tribunal,
    type,
    limit,
    error: error?.message || null,
    resultCount: data?.length ?? null
  });

  if (error) throw error;

  const results = (data || []).slice(0, limit);
  const uniqueDocs = [...new Map(results.map(r => [r.document_id, {
    document_id: r.document_id,
    title: r.title,
    type: r.doc_type,
    area: r.area,
    tribunal: r.tribunal,
    tags: r.tags
  }])).values()];

  console.log('[RAG] searchKnowledge documents:', uniqueDocs.map(d => ({ title: d.title, type: d.type, area: d.area, tribunal: d.tribunal })));

  return { results, documents: uniqueDocs };
}
