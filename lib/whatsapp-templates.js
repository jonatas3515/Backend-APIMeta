const VALID_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
const VALID_STATUSES = ['draft', 'approved'];
const VARIABLE_PATTERN = /\{\{\s*(\d+)\s*\}\}/g;

export function validateTemplate(payload) {
  const errors = [];

  if (!payload.name || !/^[a-zA-Z0-9_]+$/.test(payload.name)) {
    errors.push('name é obrigatório e deve conter apenas letras, números e underscores');
  }

  if (!payload.category || !VALID_CATEGORIES.includes(payload.category)) {
    errors.push('category inválida');
  }

  if (!payload.content || typeof payload.content !== 'string' || payload.content.length > 1000) {
    errors.push('content é obrigatório e deve ter no máximo 1000 caracteres');
  }

  if (!payload.status || !VALID_STATUSES.includes(payload.status)) {
    errors.push('status inválido');
  }

  const requiredVars = new Set((payload.content.match(VARIABLE_PATTERN) || []).map(v => v.replace(/\{\{|\}\}/g, '').trim()));
  const providedVars = new Set((payload.variables || []).map(String));

  for (const v of requiredVars) {
    if (!providedVars.has(v)) {
      errors.push(`variável {{${v}}} declarada em content mas ausente em variables`);
    }
  }

  for (const v of providedVars) {
    if (!/^\d+$/.test(v)) {
      errors.push('variables devem ser números');
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

export function applyTemplate(content, variables = {}) {
  return content.replace(VARIABLE_PATTERN, (_, key) => {
    const value = variables[key] ?? '';
    return String(value).slice(0, 100);
  });
}

export function normalizeTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    content: row.content,
    variables: row.variables || [],
    status: row.status,
    createdAt: row.created_at
  };
}
