import { useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { NAV_ITEMS } from '../lib/tabResolver';

const MOBILE_PRIMARY_KEYS = ['chat', 'cases', 'agenda', 'triage'];

export default function Sidebar({ activeTab, onChangeTab, widthClass = 'w-24' }) {
  const { canAccess, signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => canAccess(item.minRole));
  const primaryItems = visibleItems.filter((item) => MOBILE_PRIMARY_KEYS.includes(item.key));
  const overflowItems = visibleItems.filter((item) => !MOBILE_PRIMARY_KEYS.includes(item.key));

  const handleClick = (item) => {
    setMoreOpen(false);
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

  const handleSignOut = () => {
    setMoreOpen(false);
    signOut();
  };

  return (
    <>
      {/* Desktop sidebar */}
      <div
        className={`hidden md:flex ${widthClass} bg-nc-black flex-col items-center py-4 border-r border-nc-gray-800 flex-shrink-0`}
      >
        <img src="/Logo transparente.png" alt="N&C Logo" className="w-8 h-8 object-contain" />

        <nav className="flex-1 flex flex-col space-y-2 mt-6 w-full px-2 overflow-y-auto scrollbar-thin">
          {visibleItems.map((item) => (
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
            onClick={handleSignOut}
            className="w-full p-2 rounded transition text-nc-gray-500 hover:text-red-400 hover:bg-nc-gray-800/50 flex flex-col items-center gap-0.5"
            title="Sair"
          >
            <span className="text-base leading-none">🚪</span>
            <span className="text-[9px]">Sair</span>
          </button>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-nc-black border-t border-nc-gray-800 z-50 flex items-stretch justify-around px-1">
        {primaryItems.map((item) => (
          <button
            key={item.key}
            onClick={() => handleClick(item)}
            className={`flex-1 flex flex-col items-center justify-center min-w-0 min-h-[44px] px-1 py-1 rounded transition ${
              activeTab === item.key
                ? 'text-nc-yellow bg-nc-gray-800/50'
                : 'text-nc-gray-400'
            }`}
            title={item.label}
          >
            <span className="text-base leading-none">{item.icon}</span>
            <span className="text-[9px] mt-0.5 leading-tight whitespace-nowrap">{item.label}</span>
          </button>
        ))}
        <button
          onClick={() => setMoreOpen((open) => !open)}
          className={`flex-1 flex flex-col items-center justify-center min-w-0 min-h-[44px] px-1 py-1 rounded transition ${
            moreOpen ? 'text-nc-yellow bg-nc-gray-800/50' : 'text-nc-gray-400'
          }`}
          title="Mais opções"
          aria-expanded={moreOpen}
          aria-haspopup="true"
        >
          <span className="text-base leading-none">☰</span>
          <span className="text-[9px] mt-0.5 leading-tight whitespace-nowrap">Mais</span>
        </button>
      </div>

      {/* Backdrop do menu "Mais" */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMoreOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer "Mais" — desliza acima da barra inferior */}
      {moreOpen && (
        <nav
          className="md:hidden fixed bottom-16 left-0 right-0 bg-nc-black border-t border-nc-gray-800 z-50 max-h-[60vh] overflow-y-auto"
          aria-label="Mais opções"
        >
          {overflowItems.map((item) => (
            <button
              key={item.key}
              onClick={() => handleClick(item)}
              className={`w-full flex items-center gap-3 px-4 min-h-[44px] py-2.5 text-left transition border-b border-nc-gray-800/50 ${
                activeTab === item.key
                  ? 'text-nc-yellow bg-nc-gray-800/50'
                  : 'text-nc-gray-300 hover:bg-nc-gray-800/30'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 min-h-[44px] py-2.5 text-left transition text-nc-gray-300 hover:text-red-400 hover:bg-nc-gray-800/30"
          >
            <span className="text-base leading-none">🚪</span>
            <span className="text-sm">Sair</span>
          </button>
        </nav>
      )}
    </>
  );
}
