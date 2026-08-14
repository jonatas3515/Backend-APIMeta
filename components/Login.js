import { useState, useEffect } from 'react';
import { useAuth } from '../lib/useAuth';

const REMEMBER_EMAIL_KEY = 'nc_remember_email';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn } = useAuth();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
      if (saved) {
        setEmail(saved);
        setRememberMe(true);
      }
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { success, error: signInError } = await signIn(email, password);

      if (success) {
        if (typeof window !== 'undefined') {
          if (rememberMe) {
            localStorage.setItem(REMEMBER_EMAIL_KEY, email);
          } else {
            localStorage.removeItem(REMEMBER_EMAIL_KEY);
          }
        }
        onLogin();
      } else {
        setError(signInError || 'Credenciais inválidas');
      }
    } catch (err) {
      setError('Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-nc-black">
      <img
        src="/Logo transparente.png"
        alt="N&C Logo"
        className="w-64 h-64 mb-6 object-contain"
      />

      <div className="bg-nc-white rounded-nc shadow-card p-8 w-full max-w-md border border-nc-gray-300">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-nc-text mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="nc-input py-3"
              placeholder="seu@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-nc-text mb-2">
              Senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="nc-input py-3 pr-12"
                placeholder="Digite sua senha"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-nc-text-muted hover:text-nc-text"
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <div className="flex items-center">
            <input
              id="remember-me"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 text-nc-yellow border-nc-gray-300 rounded focus:ring-nc-yellow"
            />
            <label htmlFor="remember-me" className="ml-2 text-sm text-nc-text-secondary">
              Lembrar-me (salvar email)
            </label>
          </div>

          {error && (
            <div className="bg-nc-gray-100 border border-red-400 text-red-700 px-4 py-3 rounded-nc">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full nc-btn-primary py-3 disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
