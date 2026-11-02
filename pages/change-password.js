import { useState } from 'react';
import Head from 'next/head';

export default function ChangePassword() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem!');
      return;
    }

    if (newPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres!');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, name, newPassword })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(data.message);
        setUsername('');
        setEmail('');
        setName('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError(data.error || 'Erro ao alterar senha');
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Alterar Senha - Chat N&C</title>
        <link rel="icon" href="/Logo transparente.png" />
      </Head>

      <div className="min-h-screen flex items-center justify-center bg-[#181A1B] p-4 text-white">
        <div className="bg-[#1B1D1E] rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-800">
          <div className="text-center mb-8">
            <img src="/Logo transparente.png" alt="N&C Logo" className="w-24 h-24 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white">Alterar Senha</h1>
            <p className="text-gray-400 mt-2 text-sm">Chat N&C - Advocacia</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Usuário *
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-[#181A1B] border border-[#2A2D2F] rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-nc-yellow"
                placeholder="Ex: jonatas"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Se já existe, a senha será atualizada. Se não, será criado.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Nome Completo
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-[#181A1B] border border-[#2A2D2F] rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-nc-yellow"
                placeholder="Ex: Jonatas Costa"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-[#181A1B] border border-[#2A2D2F] rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-nc-yellow"
                placeholder="Ex: jonatascosta.adv@gmail.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Nova Senha *
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#181A1B] border border-[#2A2D2F] rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-nc-yellow"
                placeholder="Mínimo 6 caracteres"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Confirmar Senha *
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#181A1B] border border-[#2A2D2F] rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-nc-yellow"
                placeholder="Digite a senha novamente"
                required
              />
            </div>

            {error && (
              <div className="bg-red-950/60 border border-red-800/60 text-red-300 px-4 py-3 rounded-lg text-sm">
                ❌ {error}
              </div>
            )}

            {message && (
              <div className="bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 px-4 py-3 rounded-lg text-sm">
                ✅ {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-nc-yellow hover:bg-yellow-400 text-nc-black font-bold py-3 px-4 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Processando...' : 'Alterar Senha'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <a href="/" className="text-sm text-gray-400 hover:text-white transition">
              ← Voltar para o login
            </a>
          </div>

          <div className="mt-6 bg-[#181A1B] border border-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-300">
              <strong>💡 Dica:</strong> Use uma senha forte com letras, números e símbolos!
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
