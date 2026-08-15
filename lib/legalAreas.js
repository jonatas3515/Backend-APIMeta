export const LEGAL_AREAS = [
  { value: 'trabalhista', label: '⚖️ Trabalhista' },
  { value: 'previdenciario', label: '🏛️ Previdenciário' },
  { value: 'civel', label: '📄 Cível' },
  { value: 'consumidor', label: '🛒 Consumidor' },
  { value: 'administrativo', label: '🏢 Administrativo' }
];

export const getLegalAreaLabel = (value) =>
  LEGAL_AREAS.find((a) => a.value === value)?.label || value || 'Não classificado';
