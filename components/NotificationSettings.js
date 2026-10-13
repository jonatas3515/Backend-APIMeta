import { useEffect, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { isSupported, getPermission, requestPermission, maybeNotify } from '../lib/notifications';

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
  const [browserPermission, setBrowserPermission] = useState('default');
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    fetchPrefs();
    setBrowserPermission(getPermission());
  }, []);

  const fetchPrefs = async () => {
    try {
      const data = await apiJson('/api/notification-preferences');
      setPrefs(data && typeof data === 'object' ? data : {});
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
      const data = await apiJson('/api/notification-preferences', {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
      setPrefs(data && typeof data === 'object' ? data : {});
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

  const handleRequestPermission = async () => {
    const permission = await requestPermission();
    setBrowserPermission(permission);
  };

  const handleTestNotification = async () => {
    await maybeNotify({
      title: 'Teste de Notificação',
      body: 'As notificações estão funcionando perfeitamente!',
      tag: `test-${Date.now()}`,
      enabled: true,
      preferences: prefs
    });
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  const PERMISSION_BADGES = {
    granted: { label: '✅ Notificações permitidas no navegador', class: 'bg-green-50 text-green-800 border-green-200' },
    denied: { label: '❌ Notificações bloqueadas no navegador', class: 'bg-red-50 text-red-700 border-red-200' },
    default: { label: '⚠️ Permissão pendente', class: 'bg-amber-50 text-amber-800 border-amber-200' },
    unsupported: { label: '➖ Não suportado neste navegador', class: 'bg-nc-gray-100 text-nc-text-secondary border-nc-gray-200' }
  };

  const permissionKey = isSupported() ? (browserPermission || 'default') : 'unsupported';
  const badge = PERMISSION_BADGES[permissionKey] || PERMISSION_BADGES.default;

  if (loading) return <p className="text-sm text-nc-text-secondary">Carregando...</p>;

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-nc-text-title">Notificações do navegador</h3>
            <span
              className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border mt-1 ${badge.class}`}
              data-testid="browser-permission-badge"
            >
              {badge.label}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {browserPermission === 'default' && isSupported() && (
              <button
                onClick={handleRequestPermission}
                className="nc-btn px-3 py-2 text-sm"
              >
                Autorizar no Navegador
              </button>
            )}
            {browserPermission === 'granted' && (
              <button
                onClick={handleTestNotification}
                className="nc-btn px-3 py-2 text-sm"
                data-testid="btn-test-notification"
              >
                {testSent ? 'Notificação enviada!' : '🔔 Enviar Notificação de Teste'}
              </button>
            )}
          </div>
        </div>
        {browserPermission === 'denied' && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            As notificações foram bloqueadas. Para reativar, clique no ícone do cadeado na barra de
            endereço do navegador, localize "Notificações" e altere para "Permitir". Depois recarregue a página.
          </p>
        )}
      </div>

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


