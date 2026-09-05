import { getAuthHeaders } from './api';

/**
 * Wrapper para requisições autenticadas às API routes.
 * Adiciona automaticamente o token JWT nos headers.
 * Se receber 401, tenta renovar o token e faz retry.
 * 
 * @param {string} endpoint - URL da API (ex: '/api/send-message')
 * @param {object} options - Opções do fetch (method, body, headers, etc)
 * @returns {Promise<Response>} Resposta do fetch bruta (não parseada)
 * 
 * Use `apiJson()` para endpoints que retornam JSON.
 * Use `apiCall()` para downloads, uploads, blobs, texto, status/headers.
 * 
 * @example
 * const response = await apiCall('/api/send-message', {
 *   method: 'POST',
 *   body: JSON.stringify({ conversation_id, text })
 * });
 * const data = await response.json();
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

/**
 * Wrapper para requisições autenticadas que retornam JSON.
 * Adiciona automaticamente o token JWT nos headers.
 * Parseia JSON automaticamente e lança erro se resposta não for OK.
 * 
 * @param {string} endpoint - URL da API (ex: '/api/cases')
 * @param {object} options - Opções do fetch (method, body, headers, etc)
 * @returns {Promise<object|array|null>} Dados JSON parseados ou null para 204/205
 * 
 * @example
 * const data = await apiJson('/api/cases', { method: 'GET' });
 * const items = Array.isArray(data) ? data : [];
 */
export async function apiJson(endpoint, options = {}) {
  const response = await apiCall(endpoint, options);

  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      try {
        payload = await response.text();
      } catch {
        payload = null;
      }
    }

    const message =
      (payload && typeof payload === 'object' && (payload.error || payload.message)) ||
      (typeof payload === 'string' && payload) ||
      `HTTP ${response.status}`;

    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  // 204 / 205 ou body vazio devem devolver null, sem lançar erro.
  if (response.status === 204 || response.status === 205) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const text = await response.text();
    return text || null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export default apiCall;
