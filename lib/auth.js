import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

/**
 * Verifica o token JWT do Supabase Auth e retorna o usuário autenticado.
 * Também busca o perfil (role, name) na tabela users.
 */
export async function verifyAuthAndGetUser(req) {
  if (!supabaseAdmin) {
    throw new Error('Supabase não configurado');
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new Error('Token não fornecido');
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    throw new Error('Token não fornecido');
  }

  // Verifica token no Supabase Auth
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    throw new Error('Token inválido ou expirado');
  }

  // Busca perfil na tabela users
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, name, email, role, is_active, auth_user_id')
    .eq('auth_user_id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error('Perfil não encontrado. Entre em contato com o administrador.');
  }

  if (!profile.is_active) {
    throw new Error('Usuário inativo. Entre em contato com o administrador.');
  }

  return {
    authUser: user,
    profile
  };
}

/**
 * Verifica se o usuário tem um dos papéis permitidos.
 */
export function requireRole(profile, allowedRoles) {
  if (!allowedRoles.includes(profile.role)) {
    throw new Error(`Acesso negado. Requer um dos papéis: ${allowedRoles.join(', ')}`);
  }
}

/**
 * Hierarquia de papéis para comparação.
 * admin > advogado > estagiario
 */
export const ROLE_HIERARCHY = {
  admin: 3,
  advogado: 2,
  estagiario: 1
};

export function hasMinimumRole(profile, minimumRole) {
  return ROLE_HIERARCHY[profile.role] >= ROLE_HIERARCHY[minimumRole];
}

/**
 * Wrapper para endpoints que requerem autenticação.
 */
export function withAuth(handler, options = {}) {
  return async (req, res) => {
    try {
      const { profile } = await verifyAuthAndGetUser(req);

      if (options.minRole && !hasMinimumRole(profile, options.minRole)) {
        return res.status(403).json({
          error: `Acesso negado. Requer papel mínimo: ${options.minRole}`
        });
      }

      if (options.allowedRoles && !options.allowedRoles.includes(profile.role)) {
        return res.status(403).json({
          error: `Acesso negado. Requer um dos papéis: ${options.allowedRoles.join(', ')}`
        });
      }

      req.user = profile;
      return await handler(req, res);
    } catch (error) {
      console.error('[AUTH] Erro:', error);
      return res.status(401).json({ error: error.message });
    }
  };
}
