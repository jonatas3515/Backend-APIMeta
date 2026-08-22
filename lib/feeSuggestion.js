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
