import { supabase } from './supabaseClient';

// Previne múltiplos refreshs simultâneos
let refreshPromise = null;

function isTokenAboutToExpire(session) {
  if (!session?.expires_at) return false;
  const now = Date.now();
  const expiresAt = session.expires_at * 1000;
  return now >= expiresAt - 120000; // 2 minutos antes de expirar
}

/**
 * Retorna headers para requisições às API routes Next.js,
 * incluindo o token de autenticação do Supabase.
 * Atualiza o token automaticamente se estiver perto de expirar.
 */
export async function getAuthHeaders() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    let session = data?.session;

    if (session && isTokenAboutToExpire(session)) {

      if (refreshPromise) {
        await refreshPromise;
        const { data: refreshData } = await supabase.auth.getSession();
        session = refreshData?.session;
      } else {
        refreshPromise = supabase.auth.refreshSession();
        try {
          const { data: refreshData } = await refreshPromise;
          session = refreshData?.session;
        } finally {
          refreshPromise = null;
        }
      }
    }

    const headers = {
      'Content-Type': 'application/json'
    };

    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    } else {
      console.warn('[API] Token não encontrado na sessão');
    }

    return headers;
  } catch (error) {
    console.error('[API] Erro ao obter sessão:', error);
    return {
      'Content-Type': 'application/json'
    };
  }
}
