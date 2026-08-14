/**
 * Serviço de notificações do navegador.
 * Foco em foreground: new Notification() funciona enquanto a página estiver aberta,
 * mesmo em outra aba ou minimizado. Notificações em segundo plano requerem
 * Push API/VAPID, que está fora do escopo desta implementação.
 */

const ICON = '/Logo transparente.png';

const LAST_NOTIFIED_KEY = 'nc_last_notifications';

export function isSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getPermission() {
  if (!isSupported()) return 'default';
  return Notification.permission;
}

export async function requestPermission() {
  if (!isSupported()) return 'default';
  try {
    return await Notification.requestPermission();
  } catch (e) {
    console.error('[NOTIFICATIONS] Erro ao solicitar permissão:', e);
    return 'default';
  }
}

function getLastNotifiedMap() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(LAST_NOTIFIED_KEY) || '{}');
  } catch {
    return {};
  }
}

function setLastNotified(key, minutes = 1) {
  if (typeof window === 'undefined') return;
  const map = getLastNotifiedMap();
  map[key] = Date.now() + minutes * 60 * 1000;
  localStorage.setItem(LAST_NOTIFIED_KEY, JSON.stringify(map));
}

function canNotify(key, minutes = 1) {
  const map = getLastNotifiedMap();
  const until = map[key] || 0;
  return Date.now() > until;
}

function isInSilentHours(silentStart, silentEnd) {
  if (!silentStart || !silentEnd) return false;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = silentStart.split(':').map(Number);
  const [endH, endM] = silentEnd.split(':').map(Number);
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

export async function maybeNotify({
  title,
  body,
  tag,
  onClick,
  enabled = true,
  preferences = {}
}) {
  if (!isSupported()) return;
  if (getPermission() !== 'granted') return;
  if (!enabled) return;

  const { silent_start, silent_end } = preferences || {};
  if (isInSilentHours(silent_start, silent_end)) return;

  const trimmedTitle = (title || '').toString().slice(0, 50);
  const trimmedBody = (body || '').toString().slice(0, 100);
  const key = tag || `${trimmedTitle}-${trimmedBody}`;

  if (!canNotify(key, 1)) return;

  try {
    const notification = new Notification(trimmedTitle, {
      body: trimmedBody,
      icon: ICON,
      tag: key,
      requireInteraction: false
    });

    if (onClick && typeof onClick === 'function') {
      notification.onclick = () => {
        window.focus();
        onClick();
      };
    }

    setLastNotified(key, 1);
  } catch (e) {
    console.error('[NOTIFICATIONS] Erro ao exibir notificação:', e);
  }
}

export function schedulePermissionPrompt(profile, onPrompt) {
  if (!isSupported()) return;
  if (getPermission() !== 'default') return;
  if (typeof window === 'undefined') return;

  const askedKey = `nc_notif_prompt_${profile?.id || 'guest'}`;
  const asked = localStorage.getItem(askedKey);
  if (asked) {
    const askAfter = parseInt(asked, 10);
    if (Date.now() < askAfter) return;
  }

  onPrompt?.();
}
