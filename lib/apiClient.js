import { getAuthHeaders } from './api';

/**
 * Wrapper para requisições autenticadas às API routes.
 * Adiciona automaticamente o token JWT nos headers.
 * Se receber 401, tenta renovar o token e faz retry.
 * 
 * @param {string} endpoint - URL da API (ex: '/api/send-message')
 * @param {object} options - Opções do fetch (method, body, headers, etc)
 * @returns {Promise<Response>} Resposta do fetch
 * 
 * @example
 * const response = await apiCall('/api/send-message', {
 *   method: 'POST',
 *   body: JSON.stringify({ conversation_id, text })
 * });
 */
export async function apiCall(endpoint, options = {}) {
  try {
    // Obtém headers com token autenticado
    const authHeaders = await getAuthHeaders();
    
    // Mescla headers
    const headers = {
      ...authHeaders,
      ...options.headers
    };
    
    // Primeira tentativa
    let response = await fetch(endpoint, {
      ...options,
      headers
    });
    
    // Se 401, tenta renovar token e faz retry
    if (response.status === 401) {
      console.warn('[API] Token expirado, tentando renovar...');
      
      // Obtém novo token
      const newHeaders = await getAuthHeaders();
      response = await fetch(endpoint, {
        ...options,
        headers: {
          ...newHeaders,
          ...options.headers
        }
      });
    }
    
    return response;
  } catch (error) {
    console.error('[API] Erro na requisição:', error);
    throw error;
  }
}

export default apiCall;
