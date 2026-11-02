import { createClient } from '@supabase/supabase-js';
import { DEFAULT_OFFICE_ID } from './officeContext';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

// Lista de e-mails com permissão de Administrador Master da Plataforma
const MASTER_ADMIN_EMAILS = [
  'jonatascosta.adv@gmail.com'
];

/**
 * Retorna o office_id do tenant da requisição.
 * - Usuários normais sempre usam o seu próprio office_id.
 * - Master Admin pode opcionalmente passar 'x-office-id' para inspecionar um escritório específico.
 */
export function getTenantOfficeId(req) {
  if (req?.user?.is_master && req?.headers?.['x-office-id']) {
    return String(req.headers['x-office-id']).trim();
  }
  return req?.user?.office_id || DEFAULT_OFFICE_ID;
}

/**
 * Verifica se um usuário/perfil é Master Admin da Plataforma
 */
export function isMasterAdmin(profile) {
  if (!profile) return false;
  if (profile.is_master === true) return true;
  if (profile.email && MASTER_ADMIN_EMAILS.includes(String(profile.email).toLowerCase().trim())) {
    return true;
  }
  return false;
}

/**
 * Exige que o usuário seja Master Admin da Plataforma
 */
export function requireMasterAdmin(profile) {
  if (!isMasterAdmin(profile)) {
    throw new Error('Acesso negado: Requer privilégio de Administrador Master da Plataforma');
  }
}

/**
 * Verifica o token JWT do Supabase Auth e retorna o usuário autenticado.
 * Também busca o perfil completo (role, name, office_id, is_master) na tabela users
 * e os dados do escritório associado na tabela offices.
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
    .select('id, name, email, role, is_active, auth_user_id, office_id, is_master')
    .eq('auth_user_id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error('Perfil não encontrado. Entre em contato com o administrador.');
  }

  if (!profile.is_active) {
    throw new Error('Usuário inativo. Entre em contato com o administrador.');
  }

  // Computa se é Master Admin
  const isMaster = isMasterAdmin(profile);
  const officeId = profile.office_id || DEFAULT_OFFICE_ID;

  // Busca dados do escritório associado
  let officeData = null;
  try {
    const { data: office } = await supabaseAdmin
      .from('offices')
      .select('id, name, plan, status, trial_ends_at')
      .eq('id', officeId)
      .maybeSingle();
    officeData = office || null;
  } catch (err) {
    console.warn('[AUTH] Aviso ao carregar office do usuário:', err.message);
  }

  const enrichedProfile = {
    ...profile,
    office_id: officeId,
    is_master: isMaster,
    office: officeData
  };

  return {
    authUser: user,
    profile: enrichedProfile
  };
}

/**
 * Verifica se o usuário tem um dos papéis permitidos no seu escritório.
 */
export function requireRole(profile, allowedRoles) {
  if (!allowedRoles.includes(profile.role)) {
    throw new Error(`Acesso negado. Requer um dos papéis: ${allowedRoles.join(', ')}`);
  }
}

/**
 * Hierarquia de papéis para comparação dentro do escritório.
 * admin > advogado > estagiario
 */
export const ROLE_HIERARCHY = {
  admin: 3,
  advogado: 2,
  estagiario: 1
};

export function hasMinimumRole(profile, minimumRole) {
  return (ROLE_HIERARCHY[profile.role] || 0) >= (ROLE_HIERARCHY[minimumRole] || 0);
}

/**
 * Wrapper para endpoints que requerem autenticação.
 */
export function withAuth(handler, options = {}) {
  return async (req, res) => {
    try {
      const { profile } = await verifyAuthAndGetUser(req);

      // Verificação de Master Admin da Plataforma
      if (options.requireMaster && !profile.is_master) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[AUTH] master_admin_access_denied for:', profile.email);
        }
        return res.status(403).json({
          error: 'Acesso negado: Requer privilégio de Administrador Master da Plataforma'
        });
      }

      if (options.minRole && !hasMinimumRole(profile, options.minRole)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[AUTH] access_denied');
        }
        return res.status(403).json({
          error: `Acesso negado. Requer papel mínimo: ${options.minRole}`
        });
      }

      if (options.allowedRoles && !options.allowedRoles.includes(profile.role)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[AUTH] access_denied');
        }
        return res.status(403).json({
          error: `Acesso negado. Requer um dos papéis: ${options.allowedRoles.join(', ')}`
        });
      }

      req.user = profile;
      return await handler(req, res);
    } catch (error) {
      console.error('[AUTH] authentication_failed:', error.message);
      return res.status(401).json({ error: error.message });
    }
  };
}
