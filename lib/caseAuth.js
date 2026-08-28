import { supabaseServer } from './supabaseServer';
import { safeLog, safeError } from './safeLogger';

function safeCaseId(id) {
  return String(id || '').slice(0, 8);
}

/**
 * Verifica se o usuário pode acessar um caso.
 * - admin: acesso irrestrito
 * - advogado/estagiário: apenas caso atribuído a ele
 * Retorna { allowed: boolean, caseId: string|null }
 */
export async function verifyCaseAccess({ supabase = supabaseServer, caseId, user }) {
  if (!supabase || !caseId || !user) {
    return { allowed: false, caseId: null };
  }

  if (user.role === 'admin') {
    return { allowed: true, caseId };
  }

  try {
    const { data, error } = await supabase
      .from('cases')
      .select('id, assigned_user_id')
      .eq('id', caseId)
      .maybeSingle();

    if (error) {
      safeError('case_access_check_error', error, {
        caseIdHash: safeCaseId(caseId),
        role: user.role,
        requestId: 'datajud',
      });
      return { allowed: false, caseId: null };
    }

    if (!data) {
      return { allowed: false, caseId: null };
    }

    if (data.assigned_user_id === user.id) {
      return { allowed: true, caseId };
    }

    return { allowed: false, caseId: null };
  } catch (e) {
    safeError('case_access_check_exception', e, {
      caseIdHash: safeCaseId(caseId),
      role: user.role,
      requestId: 'datajud',
    });
    return { allowed: false, caseId: null };
  }
}

/**
 * Resolve case_id a partir de um case_process id.
 */
export async function resolveCaseIdForProcess({ supabase, processId }) {
  if (!supabase || !processId) return null;

  try {
    const { data, error } = await supabase
      .from('case_processes')
      .select('case_id')
      .eq('id', processId)
      .maybeSingle();

    if (error || !data) return null;
    return data.case_id || null;
  } catch (e) {
    safeError('resolve_case_process_error', e, {
      processIdHash: String(processId || '').slice(0, 8),
      requestId: 'datajud',
    });
    return null;
  }
}

/**
 * Resolve case_id a partir de um process_movement id.
 */
export async function resolveCaseIdForMovement({ supabase, movementId }) {
  if (!supabase || !movementId) return null;

  try {
    const { data, error } = await supabase
      .from('process_movements')
      .select('case_process_id, case_processes:case_process_id (case_id)')
      .eq('id', movementId)
      .maybeSingle();

    if (error || !data) return null;
    return data.case_processes?.case_id || null;
  } catch (e) {
    safeError('resolve_movement_case_error', e, {
      movementIdHash: String(movementId || '').slice(0, 8),
      requestId: 'datajud',
    });
    return null;
  }
}

/**
 * Middleware-like: obtém case_id, verifica acesso e retorna resposta 403 se negado.
 * Útil para handlers que precisam de defesa em profundidade.
 */
export async function requireCaseAccess({ supabase, res, caseId, user }) {
  const { allowed } = await verifyCaseAccess({ supabase, caseId, user });
  if (!allowed) {
    safeLog('warn', 'datajud_access_denied', {
      caseIdHash: safeCaseId(caseId),
      role: user?.role,
      requestId: 'datajud',
    });
    res.status(403).json({ error: 'Acesso não autorizado ao caso.' });
    return false;
  }
  return true;
}
