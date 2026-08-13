// ============================================================================
// Utilitários de formatação de dados (máscaras e conversão de datas)
// ============================================================================

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

export function maskDate(value) {
  const digits = (value || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function maskCpf(value) {
  const digits = (value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function maskCep(value) {
  const digits = (value || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function maskPhone(value) {
  const digits = (value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
  if (digits.length <= 10) return `${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function formatPhone(value) {
  if (!value) return '';
  let digits = String(value).replace(/\D/g, '');
  // Remove o prefixo do país quando presente (55)
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return value;
}

export function maskField(field, value) {
  const key = (field || '').toLowerCase();
  if (key.includes('cpf')) return maskCpf(value);
  if (key.includes('cnpj')) return maskCnpj(value);
  if (key.includes('cep')) return maskCep(value);
  if (key.includes('telefone') || key.includes('celular') || key.includes('phone')) return maskPhone(value);
  if (key.includes('data') || key.includes('nascimento')) return maskDate(value);
  return value;
}

export function maskCnpj(value) {
  const digits = (value || '').replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function dateToWords(value) {
  if (!value) return value;
  const match = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return value;
  const [, day, month, year] = match;
  const monthName = MONTHS[parseInt(month, 10) - 1];
  if (!monthName) return value;
  return `${parseInt(day, 10)} de ${monthName} de ${year}`;
}

export function formatDateInput(value) {
  return maskDate(value);
}
