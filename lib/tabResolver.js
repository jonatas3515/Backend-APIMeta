/**
 * Resolvedor de abas do menu principal.
 * Fonte única de verdade para chaves, labels e mapeamento de permissões.
 * Não faz console e não expõe dados pessoais.
 */

export const NAV_ITEMS = [
  { key: 'dashboard', icon: '📊', label: 'Dashboard', minRole: 'advogado', href: '/dashboard' },
  { key: 'chat', icon: '💬', label: 'Chat', minRole: 'estagiario' },
  { key: 'cases', icon: '⚖️', label: 'Casos', minRole: 'estagiario' },
  { key: 'funnel', icon: '🎯', label: 'Funil', minRole: 'advogado' },
  { key: 'agenda', icon: '📅', label: 'Agenda', minRole: 'advogado' },
  { key: 'triage', icon: '⏱️', label: 'Triagem', minRole: 'advogado' },
  { key: 'models-routines', icon: '�', label: 'Modelos e Rotinas', minRole: 'advogado' },
  { key: 'ai_assistant', icon: '🧠', label: 'IA', minRole: 'estagiario' },
  { key: 'knowledge', icon: '📚', label: 'Base', minRole: 'advogado' },
  { key: 'fee-services', icon: '💰', label: 'Honorários', minRole: 'admin' },
  { key: 'users', icon: '⚙️', label: 'Config.', minRole: 'advogado' },
  { key: 'profile', icon: '🔔', label: 'Perfil', minRole: 'estagiario' },
];

export function resolveTab(activeTab) {
  return NAV_ITEMS.find((item) => item.key === activeTab) || null;
}
