import { useState, useEffect } from 'react';
import { useAuth } from '../lib/useAuth';
import FeeServiceAdmin from './FeeServiceAdmin';
import FeeTablesManager from './FeeTablesManager';
import FeeSimulator from './FeeSimulator';

export default function FeeAdminPanel({ initialView = 'services' }) {
  const { profile } = useAuth();
  const [activeView, setActiveView] = useState(initialView);

  useEffect(() => {
    if (initialView) setActiveView(initialView);
  }, [initialView]);

  const userRole = profile?.role;
  const isAdminOrLawyer = userRole === 'admin' || userRole === 'advogado';
  const isAdmin = userRole === 'admin';

  if (!isAdminOrLawyer) {
    return <p className="p-4 text-sm text-red-600">Você não tem permissão para acessar esta área.</p>;
  }

  const tabs = [
    { key: 'services', label: '📋 Serviços', visible: isAdminOrLawyer },
    { key: 'reference-tables', label: '📊 Tabela da OAB', visible: isAdminOrLawyer },
    { key: 'simulations', label: '💰 Simulações / Propostas', visible: isAdminOrLawyer },
    { key: 'tracking', label: '📈 Acompanhamento', visible: isAdminOrLawyer }
  ].filter((t) => t.visible);

  return (
    <div className="flex-1 h-full flex flex-col bg-white rounded-lg shadow overflow-hidden">
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="flex gap-1 px-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition ${
                activeView === tab.key
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
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
  );
}
