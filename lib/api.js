import { supabase } from './supabaseClient';

/**
 * Retorna headers para requisições às API routes Next.js,
 * incluindo o token de autenticação do Supabase.
 */
export async function getAuthHeaders() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const session = data?.session;
    console.log('[API] Sessão obtida:', session ? 'SIM' : 'NÃO');
    
    const headers = {
      'Content-Type': 'application/json'
    };

    if (session?.access_token) {
      console.log('[API] Token encontrado:', `${session.access_token.substring(0, 20)}...`);
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
