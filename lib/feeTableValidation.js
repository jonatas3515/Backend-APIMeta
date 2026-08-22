/**
 * Validação sintética de upload de tabelas OAB.
 * Não expõe PII. Não depende de banco.
 */

function normalizeText(value) {
  if (value == null) return '';
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function findColumn(headers, candidates) {
  for (const key of headers) {
    const low = normalizeText(key);
    for (const candidate of candidates) {
      if (low.includes(candidate)) return key;
    }
  }
  return null;
}

export function validatePreview(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return { valid: false, recognized: {}, missing: ['nenhum dado'], rowCount: 0 };
  }
  const headers = Object.keys(data[0] || {});
  const recognized = {
    area: findColumn(headers, ['area', 'area_juridica', 'area juridica', 'legal_area', 'areajuridica', 'indicativo']),
    tipo: findColumn(headers, ['tipo', 'case_type', 'tipo_caso', 'tipo caso', 'tipocaso']),
    servico: findColumn(headers, ['servico', 'service', 'nome', 'item', 'descricao', 'descrição', 'atividades', 'atividade']),
    minimo: findColumn(headers, ['minimo', 'mínimo', 'min', 'min_amount', 'valor_minimo', 'valor urh', 'urh']),
    sugerido: findColumn(headers, ['sugerido', 'suggested', 'sugestao', 'sugestão', 'suggested_amount', 'r$', 'rs', 'valores']),
    maximo: findColumn(headers, ['maximo', 'máximo', 'max', 'max_amount', 'valor_maximo'])
  };
  const missing = [];
  if (!recognized.area) missing.push('Área jurídica');
  if (!recognized.servico) missing.push('Serviço');
  if (!recognized.minimo && !recognized.sugerido && !recognized.maximo) {
    missing.push('Pelo menos um valor (mínimo, sugerido ou máximo)');
  }
  return { valid: missing.length === 0, recognized, missing, rowCount: data.length };
}
