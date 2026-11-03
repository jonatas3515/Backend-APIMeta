import { useEffect, useState } from 'react';
import { useAuth } from '../lib/useAuth';
import NotificationSettings from './NotificationSettings';
import CalendarSettings from './CalendarSettings';

export default function ProfilePanel() {
  const { authUser, profile, loading, signOut, changePassword } = useAuth();
  const [client, setClient] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordMessage('');
    setPasswordError('');

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('As senhas não conferem');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      setPasswordError('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }

    setPasswordLoading(true);
    try {
      const result = await changePassword(passwordData.currentPassword, passwordData.newPassword);
      if (result?.success) {
        setPasswordMessage('✅ Senha alterada com sucesso!');
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setShowPasswordForm(false);
      } else {
        setPasswordError(result?.error || 'Erro ao alterar senha');
      }
    } catch (err) {
      setPasswordError('Erro ao alterar senha');
    } finally {
      setPasswordLoading(false);
    }
  };

  useEffect(() => {
    setClient(true);
  }, []);

  if (loading || !client) {
    return (
      <div className="flex-1 flex items-center justify-center bg-nc-surface">
        <p className="text-gray-400">Carregando...</p>
      </div>
    );
  }

  if (!authUser || !profile) {
    return (
      <div className="flex-1 flex items-center justify-center bg-nc-surface">
        <p className="text-gray-400">Acesso negado</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-nc-surface p-4 md:p-8">
      <div className="max-w-2xl mx-auto bg-[#1B1D1E] rounded-nc shadow-card border border-gray-800 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-white mb-2">👤 Perfil</h1>
        <p className="text-sm text-gray-400 mb-6">
          Gerencie suas preferências de notificação e dados pessoais.
        </p>

        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-2">Dados do usuário</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Nome:</span>
              <p className="font-medium text-gray-100">{profile.name || '-'}</p>
            </div>
            <div>
              <span className="text-gray-400">Email:</span>
              <p className="font-medium text-gray-100">{profile.email || '-'}</p>
            </div>
            <div>
              <span className="text-gray-400">Papel:</span>
              <p className="font-medium text-gray-100 capitalize">{profile.role || '-'}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">🔐 Segurança da Conta</h2>
            <button
              onClick={() => {
                setShowPasswordForm(!showPasswordForm);
                setPasswordMessage('');
                setPasswordError('');
              }}
              className="nc-btn text-sm"
              data-testid="toggle-password-form"
            >
              {showPasswordForm ? 'Cancelar' : 'Alterar minha senha'}
            </button>
          </div>

          {passwordMessage && (
            <div className="mb-3 p-3 bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 rounded-lg text-sm" data-testid="password-success">
              {passwordMessage}
            </div>
          )}
          {passwordError && (
            <div className="mb-3 p-3 bg-red-950/40 border border-red-800/60 text-red-300 rounded-lg text-sm" data-testid="password-error">
              {passwordError}
            </div>
          )}

          {showPasswordForm && (
            <form onSubmit={handlePasswordSubmit} className="space-y-3" data-testid="password-form">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Senha atual</label>
                  <input
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                    className="nc-input w-full"
                    required
                    data-testid="password-current"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Nova senha</label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    className="nc-input w-full"
                    required
                    minLength={6}
                    data-testid="password-new"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Confirmar nova senha</label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    className="nc-input w-full"
                    required
                    minLength={6}
                    data-testid="password-confirm"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={passwordLoading}
                className="nc-btn-primary text-sm"
                data-testid="password-submit"
              >
                {passwordLoading ? 'Salvando...' : 'Salvar nova senha'}
              </button>
            </form>
          )}
        </div>

        <div className="border-t border-gray-800 pt-6">
          <h2 className="text-lg font-semibold text-white mb-4">🔔 Configurações de notificação</h2>
          <NotificationSettings />
        </div>

        <div className="border-t border-gray-800 pt-6 mt-6">
          <h2 className="text-lg font-semibold text-white mb-4">📅 Calendários externos</h2>
          <CalendarSettings />
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={signOut}
            className="nc-btn text-red-400 border-red-800/60 hover:bg-red-950/40"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
