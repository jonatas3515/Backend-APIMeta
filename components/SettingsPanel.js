import { useState, useEffect } from 'react';
import { useAuth } from '../lib/useAuth';
import UserManagement from './UserManagement';
import SignatureSettings from './SignatureSettings';
import ProfilePanel from './ProfilePanel';

export default function SettingsPanel({ initialView = 'users' }) {
  const { profile } = useAuth();
  const [activeView, setActiveView] = useState(initialView);

  useEffect(() => {
    if (initialView) {
      setActiveView(initialView);
    }
  }, [initialView]);

  const isAdmin = profile?.role === 'admin';
  const isAdvogado = profile?.role === 'advogado';
  const isEstagiario = profile?.role === 'estagiario';

  const canAccessUsers = isAdmin || isAdvogado;
  const canAccessSignatures = isAdmin || isAdvogado;

  useEffect(() => {
    if (isEstagiario && activeView !== 'profile') {
      setActiveView('profile');
    }
  }, [isEstagiario, activeView]);

  const tabs = [
    { key: 'users', label: '👥 Usuários', visible: canAccessUsers },
    { key: 'signatures', label: '✍️ Assinatura Eletrônica', visible: canAccessSignatures },
    { key: 'profile', label: '👤 Perfil', visible: true },
  ].filter(tab => tab.visible);

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

      <div className="flex-1 overflow-y-auto">
        {activeView === 'users' && canAccessUsers && (
          <UserManagement viewMode="users" />
        )}
        {activeView === 'signatures' && canAccessSignatures && (
          <SignatureSettings />
        )}
        {activeView === 'profile' && (
          <ProfilePanel />
        )}
      </div>
    </div>
  );
}
