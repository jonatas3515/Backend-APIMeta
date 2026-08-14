import { useEffect, useState } from 'react';
import { useAuth } from '../lib/useAuth';
import NotificationSettings from './NotificationSettings';

export default function ProfilePanel() {
  const { authUser, profile, loading, signOut } = useAuth();
  const [client, setClient] = useState(false);

  useEffect(() => {
    setClient(true);
  }, []);

  if (loading || !client) {
    return (
      <div className="flex-1 flex items-center justify-center bg-nc-surface">
        <p className="text-nc-text-secondary">Carregando...</p>
      </div>
    );
  }

  if (!authUser || !profile) {
    return (
      <div className="flex-1 flex items-center justify-center bg-nc-surface">
        <p className="text-nc-text-secondary">Acesso negado</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-nc-surface p-4 md:p-8">
      <div className="max-w-2xl mx-auto bg-nc-white rounded-nc shadow-card border border-nc-gray-300 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-nc-text-title mb-2">👤 Perfil</h1>
        <p className="text-sm text-nc-text-secondary mb-6">
          Gerencie suas preferências de notificação e dados pessoais.
        </p>

        <div className="mb-8">
          <h2 className="text-lg font-semibold text-nc-text-title mb-2">Dados do usuário</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-nc-text-secondary">Nome:</span>
              <p className="font-medium text-nc-text">{profile.name || '-'}</p>
            </div>
            <div>
              <span className="text-nc-text-secondary">Email:</span>
              <p className="font-medium text-nc-text">{profile.email || '-'}</p>
            </div>
            <div>
              <span className="text-nc-text-secondary">Papel:</span>
              <p className="font-medium text-nc-text capitalize">{profile.role || '-'}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-nc-gray-200 pt-6">
          <h2 className="text-lg font-semibold text-nc-text-title mb-4">🔔 Configurações de notificação</h2>
          <NotificationSettings />
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={signOut}
            className="nc-btn text-red-600 border-red-200 hover:bg-red-50"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
