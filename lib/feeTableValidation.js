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

  // Suporta tanto array de objetos (antigo) quanto array de arrays (novo)
  const isArrayOfArrays = Array.isArray(data[0]);
  let headers = [];

  if (isArrayOfArrays) {
    // Usa a primeira linha como cabeçalhos quando presente
    const sample = data[0] && Array.isArray(data[0]) ? data[0] : (data.find((row) => Array.isArray(row) && row.some((cell) => cell !== '' && cell != null)) || []);
    headers = sample.map((cell, i) => (cell != null && cell !== '' ? String(cell) : `Coluna ${i + 1}`));
  } else {
    headers = Object.keys(data[0] || {});
  }

  const recognized = {
    area: findColumn(headers, ['area', 'juridica', 'juridico', 'indicativo']),
    tipo: findColumn(headers, ['tipo', 'case', 'caso']),
    servico: findColumn(headers, ['atividade', 'atividades', 'servico', 'serviço', 'descricao']),
    minimo: findColumn(headers, ['minimo', 'min', 'minima', 'menor', 'urh']),
    sugerido: findColumn(headers, ['sugerido', 'sugestao', 'valor', 'referencia']),
    maximo: findColumn(headers, ['maximo', 'max', 'maxima', 'maior'])
  };

  const missing = [];
  if (!recognized.area) missing.push('Área jurídica');
  if (!recognized.servico) missing.push('Serviço');
  if (!recognized.minimo && !recognized.sugerido && !recognized.maximo) {
    missing.push('Pelo menos um valor (mínimo, sugerido ou máximo)');
  }
  return { valid: missing.length === 0, recognized, missing, rowCount: data.length };
}
