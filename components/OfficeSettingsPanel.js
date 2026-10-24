import { useEffect, useRef, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import { getDefaultOfficeId } from '../lib/officeContext';
import { safeError } from '../lib/safeLogger';

const BIRTHDAY_DEFAULT = 'Feliz aniversário, {nome}! 🎂 Que seu dia seja repleto de alegria. Equipe {escritorio}.';
const BIRTHDAY_WEEKLY_DEFAULT = 'Olá {nome}! Seu aniversário está chegando! 🎉 Desejamos uma semana maravilhosa. Equipe {escritorio}.';

export default function OfficeSettingsPanel() {
  const officeId = getDefaultOfficeId();
  const [form, setForm] = useState({
    logo_url: '',
    birthday_message: '',
    birthday_message_weekly: '',
    notify_hour: 9,
    notify_timezone: 'America/Bahia'
  });
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.from('offices').select('*').eq('id', officeId).single()
      .then(({ data, error }) => {
        if (!mounted || error || !data) return;
        setForm({
          logo_url: data.logo_url || '',
          birthday_message: data.birthday_message || BIRTHDAY_DEFAULT,
          birthday_message_weekly: data.birthday_message_weekly || BIRTHDAY_WEEKLY_DEFAULT,
          notify_hour: data.notify_hour ?? 9,
          notify_timezone: data.notify_timezone || 'America/Bahia'
        });
      });
    return () => { mounted = false; };
  }, [officeId]);

  const save = async (fields, key) => {
    if (!supabase) { setMsg({ type: 'error', text: 'Supabase indisponível.' }); return; }
    setSaving(key);
    setMsg(null);
    const { error } = await supabase.from('offices').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', officeId);
    setSaving(null);
    if (error) {
      safeError('office_settings_save_error', error, { component: 'OfficeSettingsPanel' });
      setMsg({ type: 'error', text: 'Erro ao salvar. Verifique a migration 068.' });
    } else {
      setMsg({ type: 'success', text: 'Salvo com sucesso.' });
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload-file', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      const url = data.url || data.publicUrl || data.file_url;
      if (url) {
        setForm((f) => ({ ...f, logo_url: url }));
      } else {
        const reader = new FileReader();
        reader.onload = () => setForm((f) => ({ ...f, logo_url: reader.result }));
        reader.readAsDataURL(file);
      }
    } catch {
      const reader = new FileReader();
      reader.onload = () => setForm((f) => ({ ...f, logo_url: reader.result }));
      reader.readAsDataURL(file);
    }
  };

  const exportBackup = async () => {
    if (!supabase) { setMsg({ type: 'error', text: 'Supabase indisponível.' }); return; }
    try {
      const [{ data: tasks }, casesRes] = await Promise.all([
        supabase.from('tasks').select('*'),
        apiJson('/api/cases')
      ]);
      const backup = { exported_at: new Date().toISOString(), office_id: officeId, tasks: tasks || [], cases: casesRes || [] };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `backup-escritorio-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setMsg({ type: 'success', text: 'Backup exportado.' });
    } catch (err) {
      safeError('backup_export_error', err, { component: 'OfficeSettingsPanel' });
      setMsg({ type: 'error', text: 'Erro ao exportar backup.' });
    }
  };

  const importBackup = async (file) => {
    if (!supabase) { setMsg({ type: 'error', text: 'Supabase indisponível.' }); return; }
    try {
      const parsed = JSON.parse(await file.text());
      const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
      let ok = 0;
      for (const t of tasks) {
        const { id, created_at, updated_at, ...rest } = t;
        const { error } = await supabase.from('tasks').insert({ ...rest, office_id: officeId });
        if (!error) ok += 1;
      }
      setMsg({ type: 'success', text: `${ok} tarefa(s) importada(s) do backup.` });
    } catch {
      setMsg({ type: 'error', text: 'Arquivo de backup inválido.' });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 overflow-y-auto" data-testid="office-settings-panel">
      <h2 className="text-lg font-bold text-gray-900">🏢 Configurações do Escritório</h2>

      {msg && (
        <div className={`p-3 rounded text-sm ${msg.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{msg.text}</div>
      )}

      {/* Logo */}
      <section className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-sm text-gray-800 mb-3">🖼️ Logo do Escritório</h3>
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-64 h-64 border rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden" style={{ maxWidth: 256, maxHeight: 256 }}>
            {form.logo_url ? (
              <img src={form.logo_url} alt="Logo do escritório" className="w-full h-full object-contain" />
            ) : (
              <span className="text-xs text-gray-400 text-center px-4">Sem logo</span>
            )}
          </div>
          <div className="flex-1 min-w-[220px] space-y-2">
            <input
              type="url"
              placeholder="URL da imagem da logo"
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              className="w-full px-3 py-2 border rounded text-sm"
            />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
            <button onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm font-medium">
              📤 Enviar imagem do dispositivo
            </button>
            <button
              onClick={() => save({ logo_url: form.logo_url }, 'logo')}
              disabled={saving === 'logo'}
              className="block px-4 py-2 rounded bg-nc-black text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
              data-testid="save-logo"
            >
              {saving === 'logo' ? 'Salvando...' : 'Salvar Logo'}
            </button>
          </div>
        </div>
      </section>

      {/* Mensagem de aniversario */}
      <section className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-sm text-gray-800 mb-3">🎂 Mensagem de Aniversário</h3>
        <textarea
          rows={3}
          value={form.birthday_message}
          onChange={(e) => setForm({ ...form, birthday_message: e.target.value })}
          className="w-full px-3 py-2 border rounded text-sm"
          placeholder="Use {nome} e {escritorio} como variáveis"
        />
        <div className="flex gap-2 mt-2">
          <button onClick={() => save({ birthday_message: form.birthday_message }, 'bday')} disabled={saving === 'bday'} className="px-4 py-2 rounded bg-nc-black text-white text-sm font-medium">
            {saving === 'bday' ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={() => setForm({ ...form, birthday_message: BIRTHDAY_DEFAULT })} className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm font-medium">
            Restaurar Padrão
          </button>
        </div>
      </section>

      {/* Mensagem semanal */}
      <section className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-sm text-gray-800 mb-3">🎉 Mensagem de Aniversário Semanal</h3>
        <p className="text-xs text-gray-400 mb-2">Enviada até 7 dias antes do aniversário do cliente.</p>
        <textarea
          rows={3}
          value={form.birthday_message_weekly}
          onChange={(e) => setForm({ ...form, birthday_message_weekly: e.target.value })}
          className="w-full px-3 py-2 border rounded text-sm"
        />
        <div className="flex gap-2 mt-2">
          <button onClick={() => save({ birthday_message_weekly: form.birthday_message_weekly }, 'bdayw')} disabled={saving === 'bdayw'} className="px-4 py-2 rounded bg-nc-black text-white text-sm font-medium">
            {saving === 'bdayw' ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={() => setForm({ ...form, birthday_message_weekly: BIRTHDAY_WEEKLY_DEFAULT })} className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm font-medium">
            Restaurar Padrão Semanal
          </button>
        </div>
      </section>

      {/* Horario/notificacoes */}
      <section className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-sm text-gray-800 mb-3">⏰ Horário e Fuso das Notificações</h3>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={form.notify_hour}
            onChange={(e) => setForm({ ...form, notify_hour: Number(e.target.value) })}
            className="px-2 py-2 border rounded text-sm"
          >
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
          <select
            value={form.notify_timezone}
            onChange={(e) => setForm({ ...form, notify_timezone: e.target.value })}
            className="px-2 py-2 border rounded text-sm"
          >
            <option value="America/Bahia">America/Bahia</option>
            <option value="America/Sao_Paulo">America/Sao_Paulo</option>
          </select>
          <button onClick={() => save({ notify_hour: form.notify_hour, notify_timezone: form.notify_timezone }, 'tz')} disabled={saving === 'tz'} className="px-4 py-2 rounded bg-nc-black text-white text-sm font-medium">
            {saving === 'tz' ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && 'Notification' in window) {
                Notification.requestPermission().then((p) => {
                  if (p === 'granted') new Notification('🔔 JusJNC', { body: 'Notificação de teste do escritório.' });
                });
              }
              setMsg({ type: 'success', text: 'Notificação de teste disparada.' });
            }}
            className="px-4 py-2 rounded bg-blue-100 text-blue-700 text-sm font-medium hover:bg-blue-200"
          >
            🔔 Testar Notificação
          </button>
        </div>
      </section>

      {/* Backup */}
      <section className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-sm text-gray-800 mb-3">💾 Backup de Dados</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportBackup} className="px-4 py-2 rounded bg-nc-black text-white text-sm font-medium hover:opacity-90">
            ⬇️ Exportar Backup JSON
          </button>
          <label className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm font-medium cursor-pointer">
            ⬆️ Importar Backup
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
          </label>
        </div>
      </section>
    </div>
  );
}
