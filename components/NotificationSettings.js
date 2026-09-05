import { useEffect, useState } from 'react';
import axios from 'axios';
import { apiCall } from '../lib/apiClient';\nimport { supabase } from '../lib/supabaseClient';\n// import { getAuthHeaders } from '../lib/api';';

const TYPES = [
  { key: 'notify_messages', label: 'Mensagens do WhatsApp' },
  { key: 'notify_deadlines', label: 'Prazos vencendo' },
  { key: 'notify_assignments', label: 'Casos atribuídos' },
  { key: 'notify_reminders', label: 'Lembretes e tarefas' },
  { key: 'notify_checklist', label: 'Checklist completo' }
];

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPrefs();
  }, []);

  const fetchPrefs = async () => {
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.get('/api/notification-preferences', { headers });
      setPrefs(data);
    } catch (e) {
      console.error('[SETTINGS] Erro ao carregar:', e);
      setError('Erro ao carregar preferências.');
    } finally {
      setLoading(false);
    }
  };

  const update = async (updates) => {
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.patch('/api/notification-preferences', updates, { headers });
      setPrefs(data);
      setError('');
    } catch (e) {
      console.error('[SETTINGS] Erro ao salvar:', e);
      setError('Erro ao salvar preferências.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key) => {
    update({ [key]: !prefs[key] });
  };

  const toggleGlobal = () => {
    update({ enabled: !prefs.enabled });
  };

  const handleSilentChange = (field, value) => {
    update({ [field]: value || null });
  };

  if (loading) return <p className="text-sm text-nc-text-secondary">Carregando...</p>;

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-nc-text-title">Notificações ativas</h3>
          <p className="text-sm text-nc-text-secondary">Habilita/desabilita todos os alertas</p>
        </div>
        <button
          onClick={toggleGlobal}
          disabled={saving}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
            prefs.enabled ? 'bg-nc-yellow' : 'bg-nc-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
              prefs.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {TYPES.map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between p-3 border rounded">
            <span className="text-sm text-nc-text">{label}</span>
            <input
              type="checkbox"
              checked={!!prefs[key]}
              onChange={() => toggle(key)}
              disabled={saving || !prefs.enabled}
              className="h-4 w-4 text-nc-yellow focus:ring-nc-yellow border-nc-gray-300 rounded"
            />
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-nc-text-secondary mb-1">Horário de silêncio (início)</label>
          <input
            type="time"
            value={prefs.silent_start || ''}
            onChange={(e) => handleSilentChange('silent_start', e.target.value)}
            disabled={saving || !prefs.enabled}
            className="nc-input"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-nc-text-secondary mb-1">Horário de silêncio (fim)</label>
          <input
            type="time"
            value={prefs.silent_end || ''}
            onChange={(e) => handleSilentChange('silent_end', e.target.value)}
            disabled={saving || !prefs.enabled}
            className="nc-input"
          />
        </div>
      </div>
    </div>
  );
}
