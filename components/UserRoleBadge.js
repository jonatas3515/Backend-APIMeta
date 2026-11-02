export default function UserRoleBadge({ role, isMaster = false, className = '' }) {
  const normRole = (role || 'advogado').toLowerCase();

  let label = 'Advogado';
  let icon = '⚖️';
  let badgeClasses = 'bg-blue-500/15 text-blue-400 border border-blue-500/30';

  if (isMaster) {
    label = 'Super Admin';
    icon = '👑';
    badgeClasses = 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm shadow-purple-500/20';
  } else if (normRole === 'admin') {
    label = 'Administrador';
    icon = '👑';
    badgeClasses = 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm shadow-amber-500/20';
  } else if (normRole === 'estagiario') {
    label = 'Estagiário';
    icon = '🎓';
    badgeClasses = 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
  } else {
    label = 'Advogado';
    icon = '⚖️';
    badgeClasses = 'bg-blue-500/15 text-blue-400 border border-blue-500/30';
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase ${badgeClasses} ${className}`}
      title={`Perfil de acesso: ${label}`}
      data-testid="user-role-badge"
    >
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  );
}
