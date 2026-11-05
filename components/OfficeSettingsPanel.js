import { useEffect, useRef, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';
import { useAuth } from '../lib/useAuth';

const BIRTHDAY_DEFAULT = `Prezado(a) {nome},

Em nome de toda a equipe Neves & Costa Advocacia e Consultoria, gostaríamos de lhe desejar um *Feliz Aniversário!*
Que este novo ciclo que se inicia seja repleto de realizações, saúde, paz e muitas conquistas, tanto na vida pessoal quanto na profissional. É uma imensa honra contar com sua confiança e tê-lo(a) como parte da nossa trajetória.
Tenha um excelente dia ao lado de seus familiares e amigos.

Atenciosamente,

⚖️ Equipe Neves & Costa
📱 (73) 99934-8552
🌐 www.nevesecosta.com.br`;
const BIRTHDAY_WEEKLY_DEFAULT = 'Olá {nome}! Seu aniversário está chegando! 🎉 Desejamos uma semana maravilhosa. Equipe {escritorio}.';

export default function OfficeSettingsPanel() {
  const { profile } = useAuth();
  const officeId = profile?.office_id;
  const [form, setForm] = useState({
    logo_url: '',
    birthday_message: '',
    birthday_message_weekly: '',
    notify_hour: 9,
    notify_timezone: 'America/Bahia'
  });
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(null);
  const [testingNotif, setTestingNotif] = useState(false);
  const fileRef = useRef(null);

  const handleTestNotification = async (trigger) => {
    setTestingNotif(true);
    setMsg(null);
    try {
      const res = await apiJson(`/api/cron/daily-notifications?trigger=${trigger}&force=true`);
      if (res.success) {
        setMsg({ type: 'success', text: `✓ Teste de alerta (${trigger}) disparado para o WhatsApp (73) 99934-8552!` });
      } else {
        setMsg({ type: 'error', text: res.error || 'Erro ao enviar alerta de teste.' });
      }
    } catch (err) {
      setMsg({ type: 'error', text: err?.message || 'Erro ao disparar teste de notificação.' });
    } finally {
      setTestingNotif(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    apiJson('/api/office/current')
      .then((data) => {
        if (!mounted || !data) return;
        setForm({
          logo_url: data.logo_url || '',
          birthday_message: data.birthday_message || BIRTHDAY_DEFAULT,
          birthday_message_weekly: data.birthday_message_weekly || BIRTHDAY_WEEKLY_DEFAULT,
          notify_hour: data.notify_hour ?? 9,
          notify_timezone: data.notify_timezone || 'America/Bahia'
        });
      })
      .catch(() => {
        if (!supabase || !officeId) return;
        supabase.from('offices').select('*').eq('id', officeId).single()
          .then(({ data }) => {
            if (!mounted || !data) return;
            setForm({
              logo_url: data.logo_url || '',
              birthday_message: data.birthday_message || BIRTHDAY_DEFAULT,
              birthday_message_weekly: data.birthday_message_weekly || BIRTHDAY_WEEKLY_DEFAULT,
              notify_hour: data.notify_hour ?? 9,
              notify_timezone: data.notify_timezone || 'America/Bahia'
            });
          });
      });
    return () => { mounted = false; };
  }, [officeId]);

  const save = async (fields, key) => {
    setSaving(key);
    setMsg(null);
    try {
      const res = await apiJson('/api/office/current', {
        method: 'PUT',
        body: JSON.stringify(fields)
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('nc:office-updated', { detail: res?.office || fields }));
      }
      setMsg({ type: 'success', text: 'Configurações salvas com sucesso!' });
    } catch (err) {
      if (supabase && officeId) {
        const { error } = await supabase.from('offices').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', officeId);
        if (error) {
          safeError('office_settings_save_error', error, { component: 'OfficeSettingsPanel' });
          setMsg({ type: 'error', text: 'Erro ao salvar. Verifique suas permissões.' });
        } else {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('nc:office-updated', { detail: fields }));
          }
          setMsg({ type: 'success', text: 'Configurações salvas com sucesso!' });
        }
      } else {
        safeError('office_settings_save_error', err, { component: 'OfficeSettingsPanel' });
        setMsg({ type: 'error', text: err?.message || 'Erro ao salvar configurações do escritório.' });
      }
    } finally {
      setSaving(null);
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setSaving('logo');
    setMsg(null);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result;
          const res = await apiJson('/api/office/upload-logo', {
            method: 'POST',
            body: JSON.stringify({
              image: base64Data,
              fileName: file.name,
              contentType: file.type
            })
          });

          if (res?.logo_url) {
            setForm((f) => ({ ...f, logo_url: res.logo_url }));
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('nc:office-updated', { detail: { logo_url: res.logo_url } }));
            }
            setMsg({ type: 'success', text: 'Logomarca atualizada com sucesso!' });
          } else {
            setMsg({ type: 'error', text: 'Não foi possível salvar a imagem.' });
          }
        } catch (uploadErr) {
          safeError('office_logo_upload_error', uploadErr, { component: 'OfficeSettingsPanel' });
          setMsg({ type: 'error', text: uploadErr?.message || 'Erro ao enviar logomarca.' });
        } finally {
          setSaving(null);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      safeError('office_logo_read_error', err, { component: 'OfficeSettingsPanel' });
      setMsg({ type: 'error', text: 'Erro ao ler arquivo do dispositivo.' });
      setSaving(null);
    }
  };

  const exportBackup = async () => {
    if (!officeId) { setMsg({ type: 'error', text: 'Escritório não identificado.' }); return; }
    try {
      const [{ data: tasks }, casesRes] = await Promise.all([
        supabase ? supabase.from('tasks').select('*') : { data: [] },
        apiJson('/api/cases')
      ]);
      const backup = { exported_at: new Date().toISOString(), office_id: officeId, tasks: tasks || [], cases: casesRes || [] };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `backup-escritorio-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setMsg({ type: 'success', text: 'Backup exportado com sucesso.' });
    } catch (err) {
      safeError('backup_export_error', err, { component: 'OfficeSettingsPanel' });
      setMsg({ type: 'error', text: 'Erro ao exportar backup.' });
    }
  };

  const importBackup = async (file) => {
    if (!supabase || !officeId) { setMsg({ type: 'error', text: 'Supabase indisponível.' }); return; }
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
      <h2 className="text-lg font-bold text-white">🏢 Configurações do Escritório</h2>

      {msg && (
        <div className={`p-3 rounded text-sm ${msg.type === 'error' ? 'bg-red-950/60 text-red-300 border border-red-800/60' : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'}`}>{msg.text}</div>
      )}

      {/* Logo */}
      <section className="bg-[#1B1D1E] rounded-lg shadow p-4">
        <h3 className="font-bold text-sm text-gray-100 mb-1">🖼️ Logo do Escritório</h3>
        <p className="text-xs text-gray-500 mb-3">
          A logo definida aqui aparecerá na barra lateral (menu superior esquerdo), no cabeçalho do Dashboard e nos relatórios/documentos emitidos pelo escritório.
        </p>
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-64 h-48 border-2 border-dashed border-[#2A2D2F] rounded-xl bg-[#181A1B] flex items-center justify-center overflow-hidden p-2">
            {form.logo_url ? (
              <img src={form.logo_url} alt="Logo do escritório" className="max-w-full max-h-full object-contain rounded" />
            ) : (
              <div className="text-center p-4">
                <span className="text-2xl block mb-1">🏢</span>
                <span className="text-xs text-gray-400">Nenhuma logo personalizada</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-[220px] space-y-2">
            <input
              type="url"
              placeholder="URL da imagem da logo (https://...)"
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              className="w-full px-3 py-2 bg-[#181A1B] border border-[#2A2D2F] rounded text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-nc-yellow"
            />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="px-3 py-2 rounded bg-[#1E2022] hover:bg-[#2A2D2F] text-gray-200 border border-[#2A2D2F] text-sm font-medium transition"
              >
                📤 Enviar imagem do dispositivo
              </button>
              <button
                type="button"
                onClick={() => save({ logo_url: form.logo_url }, 'logo')}
                disabled={saving === 'logo'}
                className="px-4 py-2 rounded bg-nc-yellow text-nc-black text-sm font-bold hover:bg-yellow-400 disabled:opacity-60 transition shadow-xs"
                data-testid="save-logo"
              >
                {saving === 'logo' ? 'Salvando...' : 'Salvar Logo'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Mensagem de aniversario */}
      <section className="bg-[#1B1D1E] rounded-lg shadow p-4">
        <h3 className="font-bold text-sm text-gray-100 mb-3">🎂 Mensagem de Aniversário</h3>
        <textarea
          rows={9}
          value={form.birthday_message}
          onChange={(e) => setForm({ ...form, birthday_message: e.target.value })}
          className="w-full min-h-[220px] px-3 py-2.5 bg-[#181A1B] border border-[#2A2D2F] rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-nc-yellow leading-relaxed resize-y"
          placeholder="Use {nome} e {escritorio} como variáveis"
        />
        <div className="flex gap-2 mt-2">
          <button onClick={() => save({ birthday_message: form.birthday_message }, 'bday')} disabled={saving === 'bday'} className="px-4 py-2 rounded bg-nc-yellow text-nc-black text-sm font-bold hover:bg-yellow-400 transition">
            {saving === 'bday' ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={() => setForm({ ...form, birthday_message: BIRTHDAY_DEFAULT })} className="px-4 py-2 rounded bg-[#1E2022] hover:bg-[#2A2D2F] text-gray-200 border border-[#2A2D2F] text-sm font-medium transition">
            Restaurar Padrão
          </button>
        </div>
      </section>

      {/* Mensagem semanal */}
      <section className="bg-[#1B1D1E] rounded-lg shadow p-4">
        <h3 className="font-bold text-sm text-gray-100 mb-3">🎉 Mensagem de Aniversário Semanal</h3>
        <p className="text-xs text-gray-400 mb-2">Enviada até 7 dias antes do aniversário do cliente.</p>
        <textarea
          rows={3}
          value={form.birthday_message_weekly}
          onChange={(e) => setForm({ ...form, birthday_message_weekly: e.target.value })}
          className="w-full px-3 py-2 bg-[#181A1B] border border-[#2A2D2F] rounded text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-nc-yellow"
        />
        <div className="flex gap-2 mt-2">
          <button onClick={() => save({ birthday_message_weekly: form.birthday_message_weekly }, 'bdayw')} disabled={saving === 'bdayw'} className="px-4 py-2 rounded bg-nc-yellow text-nc-black text-sm font-bold hover:bg-yellow-400 transition">
            {saving === 'bdayw' ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={() => setForm({ ...form, birthday_message_weekly: BIRTHDAY_WEEKLY_DEFAULT })} className="px-4 py-2 rounded bg-[#1E2022] hover:bg-[#2A2D2F] text-gray-200 border border-[#2A2D2F] text-sm font-medium transition">
            Restaurar Padrão Semanal
          </button>
        </div>
      </section>

      {/* Horario/notificacoes */}
      <section className="bg-[#1B1D1E] rounded-lg shadow p-4">
        <h3 className="font-bold text-sm text-gray-100 mb-3">⏰ Horário e Fuso das Notificações</h3>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={form.notify_hour}
            onChange={(e) => setForm({ ...form, notify_hour: Number(e.target.value) })}
            className="px-2 py-2 bg-[#181A1B] border border-[#2A2D2F] rounded text-sm text-gray-100 focus:outline-none focus:border-nc-yellow"
          >
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
          <select
            value={form.notify_timezone}
            onChange={(e) => setForm({ ...form, notify_timezone: e.target.value })}
            className="px-2 py-2 bg-[#181A1B] border border-[#2A2D2F] rounded text-sm text-gray-100 focus:outline-none focus:border-nc-yellow"
          >
            <option value="America/Bahia">America/Bahia</option>
            <option value="America/Sao_Paulo">America/Sao_Paulo</option>
          </select>
          <button onClick={() => save({ notify_hour: form.notify_hour, notify_timezone: form.notify_timezone }, 'tz')} disabled={saving === 'tz'} className="px-4 py-2 rounded bg-nc-yellow text-nc-black text-sm font-bold hover:bg-yellow-400 transition">
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
            className="px-4 py-2 rounded bg-blue-950/60 text-blue-300 border border-blue-800/60 text-sm font-medium hover:bg-blue-900/60 transition"
          >
            🔔 Testar Notificação
          </button>
        </div>
      </section>

      {/* Alertas Automaticos no WhatsApp do Advogado */}
      <section className="bg-[#1B1D1E] rounded-lg shadow p-4 border border-[#2A2D2F]">
        <h3 className="font-bold text-sm text-gray-100 mb-2 flex items-center gap-2">
          <span>📱</span> Alertas Automáticos no WhatsApp Forense (73 99934-8552)
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          O assistente dispara resumos automáticos para o seu número pessoal nos seguintes horários:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 text-xs">
          <div className="p-3 bg-[#181A1B] border border-gray-800 rounded-lg">
            <span className="font-bold text-nc-yellow block mb-1">⏰ 12:00 — Véspera (D-1)</span>
            <span className="text-gray-300">Resumo dos compromissos, audiências e prazos fatais de amanhã.</span>
          </div>
          <div className="p-3 bg-[#181A1B] border border-gray-800 rounded-lg">
            <span className="font-bold text-blue-400 block mb-1">☀️ 07:00 — No Dia (D)</span>
            <span className="text-gray-300">Agenda matinal com todos os prazos e audiências previstos para hoje.</span>
          </div>
          <div className="p-3 bg-[#181A1B] border border-gray-800 rounded-lg">
            <span className="font-bold text-emerald-400 block mb-1">🎂 09:00 — Aniversários</span>
            <span className="text-gray-300">Aviso dos clientes que completam aniversário na data de hoje.</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleTestNotification('eve')}
            disabled={testingNotif}
            className="px-3 py-2 rounded bg-[#181A1B] hover:bg-[#2A2D2F] text-gray-200 border border-gray-700 text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <span>⏰</span> {testingNotif ? 'Enviando...' : 'Testar Véspera (12h)'}
          </button>
          <button
            onClick={() => handleTestNotification('day')}
            disabled={testingNotif}
            className="px-3 py-2 rounded bg-[#181A1B] hover:bg-[#2A2D2F] text-gray-200 border border-gray-700 text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <span>☀️</span> {testingNotif ? 'Enviando...' : 'Testar No Dia (7h)'}
          </button>
          <button
            onClick={() => handleTestNotification('bday')}
            disabled={testingNotif}
            className="px-3 py-2 rounded bg-[#181A1B] hover:bg-[#2A2D2F] text-gray-200 border border-gray-700 text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <span>🎂</span> {testingNotif ? 'Enviando...' : 'Testar Aniversários (9h)'}
          </button>
        </div>
      </section>

      {/* Backup */}
      <section className="bg-[#1B1D1E] rounded-lg shadow p-4">
        <h3 className="font-bold text-sm text-gray-100 mb-3">💾 Backup de Dados</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportBackup} className="px-4 py-2 rounded bg-[#1E2022] hover:bg-[#2A2D2F] text-gray-200 border border-[#2A2D2F] text-sm font-medium transition">
            ⬇️ Exportar Backup JSON
          </button>
          <label className="px-4 py-2 rounded bg-[#1E2022] hover:bg-[#2A2D2F] text-gray-200 border border-[#2A2D2F] text-sm font-medium cursor-pointer transition">
            ⬆️ Importar Backup
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
          </label>
        </div>
      </section>
    </div>
  );
}
