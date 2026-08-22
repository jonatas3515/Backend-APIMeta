export const LEGAL_AREAS = [
  { value: 'consumerista', label: '🛒️ Consumidor' },
  { value: 'trabalhista', label: '⚖️ Trabalhista' },
  { value: 'previdenciario', label: '🏛️ Previdenciário' },
  { value: 'civel', label: '📄 Cível' },
  { value: 'familia', label: 'Família' },
  { value: 'administrativo', label: '🏢 Administrativo' }
];

// Mapeamento tolerante para normalizar rótulos antigos ou variados para o value oficial
const LEGAL_AREA_ALIASES = {
  'consumerista': 'consumerista',
  'consumidor': 'consumerista',
  'direito do consumidor': 'consumerista',
  'trabalhista': 'trabalhista',
  'trabalho': 'trabalhista',
  'previ': 'previdenciario',
  'previdenciario': 'previdenciario',
  'previdenciário': 'previdenciario',
  'previdenciaria': 'previdenciario',
  'civel': 'civel',
  'cível': 'civel',
  'familia': 'familia',
  'família': 'familia',
  'familia e sucessoes': 'familia',
  'administrativo': 'administrativo',
  'administrativo publico': 'administrativo'
};

export function normalizeLegalArea(value) {
  if (!value || typeof value !== 'string') return '';
  const normalized = value.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (normalized === 'todas' || normalized === 'todas as areas' || normalized === '') return '';
  return LEGAL_AREA_ALIASES[normalized] || normalized;
}

export const getLegalAreaLabel = (value) =>
  LEGAL_AREAS.find((a) => a.value === normalizeLegalArea(value))?.label || value || 'Não classificado';
