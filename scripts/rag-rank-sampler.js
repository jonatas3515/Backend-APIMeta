/**
 * Amostragem controlada de rank do search_knowledge do PostgreSQL.
 *
 * Este script é somente leitura. Ele executa a função `search_knowledge`
 * com queries sintéticas e não sensíveis, coleta apenas os valores de
 * `rank` e produz estatísticas agregadas. Nenhum conteúdo de chunk,
 * documento ou pergunta original é persistido ou exibido.
 *
 * Requisitos:
 * - SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_URL configurados.
 * - O banco deve conter documentos `aprovado` indexados.
 *
 * Uso (manual e supervisionado):
 *   node scripts/rag-rank-sampler.js
 *
 * O script não faz deploy, não grava logs permanentes e não altera dados.
 */

import crypto from 'crypto';
import { supabaseServer } from '../lib/supabaseServer.js';
import { safeLog } from '../lib/safeLogger.js';

const QUERIES = [
  { category: 'respondivel', query: 'rescisão indireta CLT' },
  { category: 'respondivel', query: 'cobrança indevida consumidor' },
  { category: 'respondivel', query: 'tempo rural aposentadoria' },
  { category: 'respondivel', query: 'habeas corpus prisão preventiva' },
  { category: 'respondivel', query: 'defesa lançamento tributário' },
  { category: 'respondivel', query: 'divórcio consensual filhos' },
  { category: 'fora_do_dominio', query: 'como regar orquídeas' },
  { category: 'fora_do_dominio', query: 'direito empresarial reestruturação societária' },
  { category: 'fora_do_dominio', query: 'receita de bolo de cenoura' },
  { category: 'ambigua', query: 'rescisão trabalhista assédio' },
  { category: 'ambigua', query: 'propriedade intelectual' },
  { category: 'sem_resposta', query: 'período de férias contrato de trabalho' },
  { category: 'sem_resposta', query: 'indenização moral sem provas' },
  { category: 'linguagem_leiga', query: 'fui demitido sem receber e quero processar' },
  { category: 'linguagem_leiga', query: 'meu patrão não me pagou o que fazer' }
];

function hashQuery(query) {
  return crypto.createHash('sha256').update(query).digest('hex').slice(0, 16);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

async function sample() {
  if (!supabaseServer) {
    safeLog('error', 'rag_rank_sampler_no_client', {
      reason: 'supabaseServer não configurado; verifique NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY'
    });
    return;
  }

  const allRanks = [];
  const byCategory = {};
  const emptyByCategory = {};
  const rows = [];

  for (const { category, query } of QUERIES) {
    try {
      const { data, error } = await supabaseServer.rpc('search_knowledge', {
        search_query: query,
        filter_status: 'aprovado',
        filter_area: null,
        filter_tribunal: null,
        filter_type: null
      });

      if (error) {
        safeLog('warn', 'rag_rank_sampler_query_error', {
          queryHash: hashQuery(query),
          category,
          errorCode: error.code,
          errorMessage: error.message
        });
        continue;
      }

      const results = data || [];
      const ranks = results.map(r => r.rank ?? 0);
      ranks.sort((a, b) => a - b);

      const stats = {
        queryHash: hashQuery(query),
        category,
        sampleSize: 1,
        resultCount: results.length,
        empty: results.length === 0,
        approvedOnly: results.length > 0 ? results.every(r => true) : true,
        rankMin: ranks[0] ?? null,
        rankMax: ranks[ranks.length - 1] ?? null,
        rankP25: percentile(ranks, 25),
        rankP50: percentile(ranks, 50),
        rankP75: percentile(ranks, 75),
        rankP90: percentile(ranks, 90),
        rankP95: percentile(ranks, 95),
        rankP99: percentile(ranks, 99)
      };

      rows.push(stats);
      allRanks.push(...ranks);

      byCategory[category] = byCategory[category] || [];
      byCategory[category].push(...ranks);

      emptyByCategory[category] = emptyByCategory[category] || { total: 0, empty: 0 };
      emptyByCategory[category].total += 1;
      if (results.length === 0) {
        emptyByCategory[category].empty += 1;
      }
    } catch (err) {
      safeLog('warn', 'rag_rank_sampler_exception', {
        queryHash: hashQuery(query),
        category,
        errorMessage: err.message
      });
    }
  }

  allRanks.sort((a, b) => a - b);

  const summaryByCategory = Object.entries(byCategory).map(([category, ranks]) => {
    ranks.sort((a, b) => a - b);
    const empty = emptyByCategory[category] || { total: 0, empty: 0 };
    return {
      category,
      sampleCount: empty.total,
      emptyCount: empty.empty,
      resultCount: ranks.length,
      rankMin: ranks[0] ?? null,
      rankMax: ranks[ranks.length - 1] ?? null,
      rankP25: percentile(ranks, 25),
      rankP50: percentile(ranks, 50),
      rankP75: percentile(ranks, 75),
      rankP90: percentile(ranks, 90),
      rankP95: percentile(ranks, 95),
      rankP99: percentile(ranks, 99)
    };
  });

  const overall = {
    sampleCount: QUERIES.length,
    categoryCount: summaryByCategory.length,
    rankMin: allRanks[0] ?? null,
    rankMax: allRanks[allRanks.length - 1] ?? null,
    rankP25: percentile(allRanks, 25),
    rankP50: percentile(allRanks, 50),
    rankP75: percentile(allRanks, 75),
    rankP90: percentile(allRanks, 90),
    rankP95: percentile(allRanks, 95),
    rankP99: percentile(allRanks, 99)
  };

  const output = {
    event: 'rag_rank_sampler_report',
    overall,
    byCategory: summaryByCategory,
    rows
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(output, null, 2));
}

sample().catch(err => {
  safeLog('error', 'rag_rank_sampler_fatal', { errorMessage: err.message });
  process.exit(1);
});
