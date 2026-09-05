import { useState } from 'react';
import { requestPermission } from '../lib/notifications';
import axios from 'axios';
import { apiCall } from '../lib/apiClient';\nimport { supabase } from '../lib/supabaseClient';\n// import { getAuthHeaders } from '../lib/api';';

export default function NotificationPermissionPrompt({ profile, onClose, onUpdate }) {
  const [loading, setLoading] = useState(false);

  const save = async (enabled, askAfter) => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      await axios.patch('/api/notification-preferences', {
        enabled,
        ask_again_after: askAfter
      }, { headers });
      onUpdate?.();
    } catch (e) {
      console.error('[PROMPT] Erro ao salvar preferências:', e);
    } finally {
      setLoading(false);
      onClose();
    }
  };

  const handleEnable = async () => {
    const permission = await requestPermission();
    if (permission === 'granted') {
      await save(true, null);
    } else {
      const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await save(false, sevenDays);
    }
  };

  const handleLater = async () => {
    const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await save(null, sevenDays);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-nc-black/60 backdrop-blur-sm p-4">
      <div className="bg-nc-white rounded-nc shadow-card border border-nc-gray-300 p-6 w-full max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">🔔</span>
          <h2 className="text-lg font-bold text-nc-text-title">Ativar notificações?</h2>
        </div>

        <p className="text-sm text-nc-text-secondary mb-4">
          Receba alertas de novas mensagens e prazos mesmo com o navegador em segundo plano.
          Você pode desativar a qualquer momento nas configurações.
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleEnable}
            disabled={loading}
            className="w-full nc-btn-primary py-2 disabled:opacity-50"
          >
            {loading ? 'Salvando...' : 'Ativar notificações'}
          </button>
          <button
            onClick={handleLater}
            disabled={loading}
            className="w-full nc-btn py-2 disabled:opacity-50"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}

