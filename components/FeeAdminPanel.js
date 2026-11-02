import { useState, useEffect } from 'react';
import { useAuth } from '../lib/useAuth';
import FeeServiceAdmin from './FeeServiceAdmin';
import FeeTablesManager from './FeeTablesManager';
import FeeSimulator from './FeeSimulator';

export default function FeeAdminPanel({ initialView = 'services' }) {
  const { profile } = useAuth();
  const [activeView, setActiveView] = useState(initialView === 'central' ? 'services' : initialView);

  useEffect(() => {
    if (initialView) setActiveView(initialView === 'central' ? 'services' : initialView);
  }, [initialView]);

  const userRole = profile?.role;
  const isAdminOrLawyer = userRole === 'admin' || userRole === 'advogado';
  const isAdmin = userRole === 'admin';

  if (!isAdminOrLawyer) {
    return (
      <div className="p-6 bg-[#1B1D1E] rounded-xl border border-red-900/40 shadow">
        <p className="text-sm text-red-400 font-medium">🚫 Acesso restrito</p>
        <p className="text-sm text-gray-400 mt-1">Esta função é restrita a administradores e advogados.</p>
      </div>
    );
  }

  const tabs = [
    { key: 'services', label: '📋 Serviços', visible: isAdminOrLawyer },
    { key: 'reference-tables', label: '📊 Tabela OAB', visible: isAdminOrLawyer },
    { key: 'simulations', label: '💰 Simulações', visible: isAdminOrLawyer },
    { key: 'tracking', label: '📈 Acompanhamento', visible: isAdminOrLawyer }
  ].filter((t) => t.visible);

  return (
    <div className="flex-1 h-full flex flex-col bg-[#181A1B] text-gray-100 rounded-xl border border-gray-800 shadow overflow-hidden">
      <div className="border-b border-gray-800 bg-[#1B1D1E]">
        <div className="flex gap-1 px-2 sm:px-4 overflow-x-auto scrollbar-none whitespace-nowrap">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              className={`px-3 sm:px-6 py-2.5 sm:py-3 font-medium text-xs sm:text-sm border-b-2 flex-shrink-0 whitespace-nowrap transition ${
                activeView === tab.key
                  ? 'text-nc-yellow border-nc-yellow font-bold'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 pb-24 md:pb-4">
        {activeView === 'services' && (
          <FeeServiceAdmin viewMode="services" />
        )}
        {activeView === 'reference-tables' && (
          <FeeTablesManager viewMode="reference" />
        )}
        {activeView === 'simulations' && (
          <FeeSimulator isAdminOrLawyer={isAdminOrLawyer} showTracking={false} />
        )}
        {activeView === 'tracking' && (
          <FeeSimulator isAdminOrLawyer={isAdminOrLawyer} showTracking={true} hideForm={true} />
        )}
        </div>
      </div>
    </div>
  );
}
