import { useState, useEffect } from 'react';
import { useAuth } from '../lib/useAuth';
import { apiJson } from '../lib/apiClient';

export default function UserManagement() {
  const { profile, changePassword } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'estagiario',
    password: ''
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    if (profile?.role && profile.role !== 'estagiario') {
      fetchUsers();
    }
  }, [profile?.role]);

  const fetchUsers = async () => {
    if (profile?.role === 'estagiario') return;
    setLoading(true);
    try {
      const data = await apiJson('/api/auth/users', { method: 'GET' });
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Erro ao conectar com servidor');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('As senhas não conferem');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }

    setPasswordLoading(true);
    try {
      const result = await changePassword(passwordData.currentPassword, passwordData.newPassword);
      if (result.success) {
        setMessage('Senha alterada com sucesso');
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setShowPasswordForm(false);
      } else {
        setError(result.error || 'Erro ao alterar senha');
      }
    } catch (err) {
      setError('Erro ao alterar senha');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!formData.name || !formData.email || !formData.password) {
      setError('Preencha todos os campos');
      return;
    }

    try {
      await apiJson('/api/auth/users', {
        method: 'POST',
        body: JSON.stringify(formData)
      });

      setMessage('Usuário criado com sucesso');
      setFormData({ name: '', email: '', role: 'estagiario', password: '' });
      setShowForm(false);
      fetchUsers();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Erro ao criar usuário');
    }
  };

  const toggleActive = async (userId, isActive) => {
    try {
      await apiJson('/api/auth/users', {
        method: 'PATCH',
        body: JSON.stringify({ id: userId, is_active: !isActive })
      });
      fetchUsers();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Erro ao atualizar usuário');
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'admin': return '👑 Admin';
      case 'advogado': return '⚖️ Advogado';
      case 'estagiario': return '🎓 Estagiário';
      default: return role;
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin': return 'text-red-600 bg-red-100';
      case 'advogado': return 'text-blue-600 bg-blue-100';
      case 'estagiario': return 'text-green-600 bg-green-100';
      default: return 'text-gray-300 bg-[#2A2D2F] border border-gray-700';
    }
  };

  const isAdmin = profile?.role === 'admin';
  const isAdvogado = profile?.role === 'advogado';
  const isEstagiario = profile?.role === 'estagiario';
  const canCreateUsers = isAdmin || isAdvogado;

  return (
    <div className="flex-1 flex flex-col bg-[#1B1D1E] overflow-y-auto">
      <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">
          {isAdmin ? '⚙️ Gestão de Usuários' : isAdvogado ? '👥 Gestão de Equipe' : '🎓 Meu Perfil'}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowPasswordForm(!showPasswordForm);
              setShowForm(false);
              setMessage('');
              setError('');
            }}
            className="px-4 py-2 bg-[#1E2022] text-gray-200 border border-[#2A2D2F] rounded-lg text-sm font-medium hover:border-nc-yellow hover:text-nc-yellow transition"
          >
            {showPasswordForm ? 'Cancelar' : '🔐 Alterar Senha'}
          </button>
          {canCreateUsers && (
            <button
              onClick={() => {
                setShowForm(!showForm);
                setShowPasswordForm(false);
                setMessage('');
                setError('');
                // Define papel inicial válido conforme nível de permissão
                setFormData(prev => ({
                  ...prev,
                  role: isAdvogado ? 'estagiario' : (prev.role === 'admin' && !profile?.is_master ? 'advogado' : prev.role)
                }));
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              {showForm ? 'Cancelar' : isAdvogado ? '+ Novo Estagiário' : '+ Novo Usuário'}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-green-100 border border-green-300 text-green-800 rounded">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded">
          {error}
        </div>
      )}

      {showPasswordForm && (
        <form onSubmit={handlePasswordSubmit} className="mb-6 p-4 border border-gray-800 rounded-xl bg-[#181A1B]">
          <h3 className="font-semibold mb-3">🔐 Alterar minha senha</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Senha atual</label>
              <input
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                className="w-full px-3 py-2 border border-[#2A2D2F] rounded text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Nova senha</label>
              <input
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                className="w-full px-3 py-2 border border-[#2A2D2F] rounded text-sm"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Confirmar nova senha</label>
              <input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                className="w-full px-3 py-2 border border-[#2A2D2F] rounded text-sm"
                required
                minLength={6}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={passwordLoading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {passwordLoading ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 border border-gray-800 rounded-xl bg-[#181A1B]">
          <h3 className="font-semibold mb-3">Criar novo usuário</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Nome</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-[#2A2D2F] rounded text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-[#2A2D2F] rounded text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Papel</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3 py-2 border border-[#2A2D2F] rounded text-sm"
              >
                {profile?.is_master && <option value="admin">👑 Admin</option>}
                {isAdmin && <option value="advogado">⚖️ Advogado</option>}
                <option value="estagiario">🎓 Estagiário</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Senha inicial</label>
              <input
                type="text"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-[#2A2D2F] rounded text-sm"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
          >
            Criar Usuário
          </button>
        </form>
      )}

      {isEstagiario ? (
        <div className="p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-sm">
          🎓 Seu acesso como <strong>Estagiário</strong> permite visualizar e atuar nos casos atribuídos a você. Apenas administradores e advogados têm permissão para cadastrar e gerenciar membros da equipe.
        </div>
      ) : loading ? (
        <p className="text-gray-500">Carregando...</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-[#181A1B]">
              <th className="text-left p-3 font-semibold text-gray-400">Nome</th>
              <th className="text-left p-3 font-semibold text-gray-400">Email</th>
              <th className="text-left p-3 font-semibold text-gray-400">Papel</th>
              <th className="text-left p-3 font-semibold text-gray-400">Status</th>
              <th className="text-left p-3 font-semibold text-gray-400">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center p-6 text-gray-500">
                  Nenhum usuário encontrado
                </td>
              </tr>
            ) : (
              users.map(user => (
                <tr key={user.id} className="border-b border-gray-800 hover:bg-[#1E2022] transition">
                  <td className="p-3">{user.name}</td>
                  <td className="p-3 text-gray-400">{user.email}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getRoleColor(user.role)}`}>
                      {getRoleLabel(user.role)}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {user.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="p-3">
                    {(isAdmin || (isAdvogado && user.role === 'estagiario')) && user.id !== profile?.id && (
                      <button
                        onClick={() => toggleActive(user.id, user.is_active)}
                        className={`text-xs px-3 py-1 rounded transition ${user.is_active ? 'bg-red-950/60 text-red-300 border border-red-800/60 hover:bg-red-900/60' : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900/60'}`}
                      >
                        {user.is_active ? 'Desativar' : 'Ativar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
      </div>
    </div>
  );
}
