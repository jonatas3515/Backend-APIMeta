// ============================================================================
// UTILITÁRIO DE SUGESTÃO DE HONORÁRIOS COM BASE NA TABELA OAB
// ============================================================================
// Não expõe PII. Calcula sugestão regional entre 70% e 80% do valor OAB.
// ============================================================================

const REGIONAL_MIN_FACTOR = 0.70;
const REGIONAL_MAX_FACTOR = 0.80;

/**
 * Calcula sugestão regional baseada no valor sugerido da OAB.
 * @param {number} oabSuggested - valor sugerido da tabela OAB
 * @param {number} factor - fator entre REGIONAL_MIN_FACTOR e REGIONAL_MAX_FACTOR (default 0.75)
 * @returns {number} valor sugerido regional
 */
export function calculateRegionalSuggestion(oabSuggested, factor = 0.75) {
  const value = Number(oabSuggested || 0);
  if (isNaN(value) || value <= 0) return 0;

  const safeFactor = Math.min(Math.max(Number(factor) || 0.75, REGIONAL_MIN_FACTOR), REGIONAL_MAX_FACTOR);
  return parseFloat((value * safeFactor).toFixed(2));
}

/**
 * Retorna uma faixa de sugestão (mínimo, sugerido regional, máximo).
 * @param {object} oabReference - { min_amount, suggested_amount, max_amount }
 * @param {number} factor
 * @returns {object} { min, suggested, max, factor }
 */
export function calculateSuggestionRange(oabReference, factor = 0.75) {
  const safeFactor = Math.min(Math.max(Number(factor) || 0.75, REGIONAL_MIN_FACTOR), REGIONAL_MAX_FACTOR);
  return {
    min: Number(oabReference?.min_amount || 0),
    suggested: calculateRegionalSuggestion(oabReference?.suggested_amount, safeFactor),
    max: Number(oabReference?.max_amount || 0),
    factor: safeFactor
  };
}

/**
 * Calcula percentual de desconto em relação à OAB.
 * @param {number} oabSuggested
 * @param {number} proposed
 * @returns {number|null}
 */
export function calculateOabDiscount(oabSuggested, proposed) {
  const oab = Number(oabSuggested);
  const prop = Number(proposed);
  if (!oab || !prop || oab <= 0) return null;
  const discount = ((oab - prop) / oab) * 100;
  return parseFloat(discount.toFixed(2));
}

// ============================================================================
// NORMALIZAÇÃO DE TEXTO E ÁREA JURÍDICA (matching catálogo ↔ tabela OAB)
// ============================================================================

/**
 * Normaliza texto para comparação: remove acentos, lowercase, trim.
 */
export function normalizeText(value) {
  if (value == null) return '';
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const LEGAL_AREA_PATTERNS = [
  [/famil|sucess/i, 'familia'],
  [/civ/i, 'civel'],
  [/trabalh/i, 'trabalhista'],
  [/penal|crim/i, 'penal'],
  [/consumidor/i, 'consumidor'],
  [/tribut|fiscal/i, 'tributario'],
  [/previdenc/i, 'previdenciario'],
  [/administrativ/i, 'administrativo'],
  [/empresar|comercial|societar/i, 'empresarial'],
  [/imobili|loca/i, 'imobiliario']
];

/**
 * Converte um rótulo livre de área jurídica (do caso, do catálogo ou de
 * cabeçalho de seção da tabela OAB) em uma chave interna estável.
 * Retorna null quando a área é ausente ou desconhecida.
 *
 * Ex.: 'Cível' → 'civel'; 'Direito Civil' → 'civel';
 * 'ATIVIDADES EM MATÉRIA DE FAMÍLIA E SUCESSÕES' → 'familia'.
 */
export function normalizeLegalArea(value) {
  const norm = normalizeText(value);
  if (!norm) return null;
  for (const [pattern, key] of LEGAL_AREA_PATTERNS) {
    if (pattern.test(norm)) return key;
  }
  return null;
}

const SERVICE_STOPWORDS = new Set([
  'acao', 'de', 'do', 'da', 'das', 'dos', 'e', 'ou', 'para', 'em', 'por',
  'a', 'o', 'as', 'os', 'no', 'na', 'nos', 'nas', 'com', 'seu', 'sua',
  'seus', 'suas', 'ao', 'aos', 'um', 'uma'
]);

/**
 * Pontua a compatibilidade entre o nome de um serviço do catálogo interno
 * e o nome de um item da tabela OAB.
 *
 * Regras (maior pontuação = melhor candidato):
 *  - 100: igualdade exata (normalizada)
 *  - 80:  um contém o outro integralmente
 *  - 10+: matching por tokens relevantes (>= 4 chars, sem stopwords);
 *         +10 por token coincidente, +20 se todos os tokens coincidirem
 *  - 0:   sem compatibilidade
 */
export function scoreServiceMatch(serviceName, referenceName) {
  const s = normalizeText(serviceName);
  const r = normalizeText(referenceName);
  if (!s || !r) return 0;
  if (s === r) return 100;
  if (r.includes(s) || s.includes(r)) return 80;

  const tokens = s.split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !SERVICE_STOPWORDS.has(t));
  if (tokens.length === 0) return 0;

  const matched = tokens.filter((t) => r.includes(t));
  if (matched.length === 0) return 0;

  return 10 + matched.length * 10 + (matched.length === tokens.length ? 20 : 0);
}

/**
 * Retorna os itens de referência compatíveis com o serviço, ordenados por
 * pontuação decrescente. Cada item recebe o campo `match_score`.
 */
export function rankServiceMatches(serviceName, references) {
  if (!Array.isArray(references)) return [];
  return references
    .map((ref) => ({ ...ref, match_score: scoreServiceMatch(serviceName, ref && ref.service) }))
    .filter((ref) => ref.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score);
}
