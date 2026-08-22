import { useAuth } from '../lib/useAuth';

const NAV_ITEMS = [
  { key: 'dashboard', icon: '📊', label: 'Dashboard', minRole: 'advogado', href: '/dashboard' },
  { key: 'chat', icon: '💬', label: 'Chat', minRole: 'estagiario' },
  { key: 'cases', icon: '⚖️', label: 'Casos', minRole: 'estagiario' },
  { key: 'funnel', icon: '🎯', label: 'Funil', minRole: 'advogado' },
  { key: 'agenda', icon: '📅', label: 'Agenda', minRole: 'advogado' },
  { key: 'triage', icon: '⏱️', label: 'Triagem', minRole: 'advogado' },
  { key: 'collaboration', icon: '🤝', label: 'Colab.', minRole: 'advogado' },
  { key: 'templates', icon: '📄', label: 'Docs', minRole: 'estagiario' },
  { key: 'routines', icon: '🔄', label: 'Rotinas', minRole: 'estagiario' },
  { key: 'insights', icon: '💡', label: 'Insights', minRole: 'advogado' },
  { key: 'ai_assistant', icon: '🧠', label: 'IA', minRole: 'estagiario' },
  { key: 'knowledge', icon: '📚', label: 'Base', minRole: 'advogado' },
  { key: 'fee-services', icon: '💰', label: 'Honorários', minRole: 'admin' },
  { key: 'users', icon: '⚙️', label: 'Config.', minRole: 'advogado' },
  { key: 'profile', icon: '🔔', label: 'Perfil', minRole: 'estagiario' },
];

export default function Sidebar({ activeTab, onChangeTab, widthClass = 'w-24' }) {
  const { canAccess, signOut } = useAuth();

  const handleClick = (item) => {
    if (item.href) {
      if (typeof window !== 'undefined') {
        window.location.href = item.href;
      }
    } else if (onChangeTab) {
      onChangeTab(item.key);
    } else if (typeof window !== 'undefined') {
      window.location.href = `/?tab=${item.key}`;
    }
  };

  return (
    <>
      {/* Desktop sidebar */}
      <div
        className={`hidden md:flex ${widthClass} bg-nc-black flex-col items-center py-4 border-r border-nc-gray-800 flex-shrink-0`}
      >
        <img src="/Logo transparente.png" alt="N&C Logo" className="w-8 h-8 object-contain" />

        <nav className="flex-1 flex flex-col space-y-2 mt-6 w-full px-2 overflow-y-auto scrollbar-thin">
          {NAV_ITEMS.filter((item) => canAccess(item.minRole)).map((item) => (
            <button
              key={item.key}
              onClick={() => handleClick(item)}
              className={`p-2 rounded transition relative flex flex-col items-center justify-center gap-0.5 ${
                activeTab === item.key
                  ? 'text-nc-yellow bg-nc-gray-800/50'
                  : 'text-nc-gray-400 hover:text-nc-white hover:bg-nc-gray-800/30'
              }`}
              title={item.label}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="text-[9px] truncate w-full text-center leading-tight">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="w-full px-2 pb-2 mt-2 border-t border-nc-gray-800 pt-2">
          <button
            onClick={signOut}
            className="w-full p-2 rounded transition text-nc-gray-500 hover:text-red-400 hover:bg-nc-gray-800/50 flex flex-col items-center gap-0.5"
            title="Sair"
          >
            <span className="text-base leading-none">🚪</span>
            <span className="text-[9px]">Sair</span>
          </button>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-nc-black border-t border-nc-gray-800 z-50 flex items-center justify-around px-1 overflow-x-auto">
        {[
          { key: 'chat', icon: '💬', label: 'Chat', minRole: 'estagiario' },
          { key: 'cases', icon: '⚖️', label: 'Casos', minRole: 'estagiario' },
          { key: 'ai_assistant', icon: '🧠', label: 'IA', minRole: 'estagiario' },
          { key: 'agenda', icon: '📅', label: 'Agenda', minRole: 'advogado' },
          { key: 'users', icon: '⚙️', label: 'Config.', minRole: 'advogado' },
        ]
          .filter((item) => canAccess(item.minRole))
          .map((item) => (
            <button
              key={item.key}
              onClick={() => handleClick(item)}
              className={`flex-1 flex flex-col items-center justify-center min-w-0 p-1 rounded transition ${
                activeTab === item.key
                  ? 'text-nc-yellow bg-nc-gray-800/50'
                  : 'text-nc-gray-400'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="text-[9px] mt-0.5 leading-tight whitespace-nowrap">{item.label}</span>
            </button>
          ))}
        <button
          onClick={signOut}
          className="flex-1 flex flex-col items-center justify-center min-w-0 p-1 text-nc-gray-400 hover:text-red-400 transition"
        >
          <span className="text-base leading-none">🚪</span>
          <span className="text-[9px] mt-0.5 leading-tight whitespace-nowrap">Sair</span>
        </button>
      </div>

      <div className="md:hidden h-16 flex-shrink-0" />
    </>
  );
}
