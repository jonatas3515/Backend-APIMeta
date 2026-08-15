import { useState, useEffect } from 'react';
import { useAuth } from '../lib/useAuth';
import SignatureSettings from './SignatureSettings';

export default function UserManagement() {
  const { profile, changePassword } = useAuth();
  const [activeSection, setActiveSection] = useState('users');
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
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = (await getSessionToken())?.access_token;
      const res = await fetch('/api/auth/users', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        const err = await res.json();
        setError(err.error || 'Erro ao buscar usuários');
      }
    } catch (err) {
      console.error(err);
      setError('Erro ao conectar com servidor');
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

  const getSessionToken = async () => {
    const { data } = await import('../lib/supabaseClient').then(m => m.supabase.auth.getSession());
    return data?.session;
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
      const token = (await getSessionToken())?.access_token;
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setMessage('Usuário criado com sucesso');
        setFormData({ name: '', email: '', role: 'estagiario', password: '' });
        setShowForm(false);
        fetchUsers();
      } else {
        const err = await res.json();
        setError(err.error || 'Erro ao criar usuário');
      }
    } catch (err) {
      console.error(err);
      setError('Erro ao conectar com servidor');
    }
  };

  const toggleActive = async (userId, isActive) => {
    try {
      const token = (await getSessionToken())?.access_token;
      const res = await fetch('/api/auth/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ id: userId, is_active: !isActive })
      });

      if (res.ok) {
        fetchUsers();
      } else {
        const err = await res.json();
        setError(err.error || 'Erro ao atualizar usuário');
      }
    } catch (err) {
      console.error(err);
      setError('Erro ao conectar com servidor');
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
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const canCreateAdmin = profile?.role === 'admin';
  const isAdmin = profile?.role === 'admin';

  return (
    <div className="flex-1 flex flex-col bg-white overflow-y-auto">
      {/* Abas de seção */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        <button
          onClick={() => setActiveSection('users')}
          className={`px-6 py-3 font-medium text-sm border-b-2 transition ${
            activeSection === 'users'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-600 border-transparent hover:text-gray-900'
          }`}
        >
          👥 Usuários
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveSection('signatures')}
            className={`px-6 py-3 font-medium text-sm border-b-2 transition ${
              activeSection === 'signatures'
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-600 border-transparent hover:text-gray-900'
            }`}
          >
            ✍️ Assinatura Eletrônica
          </button>
        )}
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        {activeSection === 'users' ? (
          <>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {isAdmin ? '⚙️ Gestão de Usuários' : '🎓 Configurações'}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowPasswordForm(!showPasswordForm);
              setShowForm(false);
              setMessage('');
              setError('');
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
          >
            {showPasswordForm ? 'Cancelar' : '🔐 Alterar Senha'}
          </button>
          {isAdmin && (
            <button
              onClick={() => {
                setShowForm(!showForm);
                setShowPasswordForm(false);
                setMessage('');
                setError('');
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              {showForm ? 'Cancelar' : '+ Novo Usuário'}
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
        <form onSubmit={handlePasswordSubmit} className="mb-6 p-4 border rounded-lg bg-gray-50">
          <h3 className="font-semibold mb-3">🔐 Alterar minha senha</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha atual</label>
              <input
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
              <input
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
              <input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
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
        <form onSubmit={handleSubmit} className="mb-6 p-4 border rounded-lg bg-gray-50">
          <h3 className="font-semibold mb-3">Criar novo usuário</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Papel</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              >
                {canCreateAdmin && <option value="admin">Admin</option>}
                {canCreateAdmin && <option value="advogado">Advogado</option>}
                <option value="estagiario">Estagiário</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha inicial</label>
              <input
                type="text"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
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

      {loading ? (
        <p className="text-gray-500">Carregando...</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3 font-semibold">Nome</th>
              <th className="text-left p-3 font-semibold">Email</th>
              <th className="text-left p-3 font-semibold">Papel</th>
              <th className="text-left p-3 font-semibold">Status</th>
              <th className="text-left p-3 font-semibold">Ações</th>
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
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">{user.name}</td>
                  <td className="p-3 text-gray-600">{user.email}</td>
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
                    {isAdmin && (
                      <button
                        onClick={() => toggleActive(user.id, user.is_active)}
                        className={`text-xs px-3 py-1 rounded ${user.is_active ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
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
          </>
        ) : activeSection === 'signatures' ? (
          <SignatureSettings />
        ) : null}
      </div>
    </div>
  );
}
