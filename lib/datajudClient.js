/**
 * Cliente leve para consulta pública ao DataJud/CNJ.
 * Nunca registra a API key, headers, URL, alias ou respostas completas.
 */

import { DATAJUD_BASE_URL, resolveCourtAlias, getCourtName } from './datajudCourts';
import { safeLog, safeError } from './safeLogger';

function normalizeProcessNumber(number) {
  return String(number || '').replace(/\D/g, '');
}

function formatProcessNumber(number) {
  const n = normalizeProcessNumber(number);
  if (n.length !== 20) return n;
  return `${n.slice(0, 7)}-${n.slice(7, 9)}.${n.slice(9, 13)}.${n.slice(13, 14)}.${n.slice(14, 16)}.${n.slice(16, 20)}`;
}

function validateProcessNumber(number) {
  const n = normalizeProcessNumber(number);
  if (n.length !== 20) return { valid: false, error: 'Número CNJ deve conter 20 dígitos.' };

  // Verificação ISO 7064 Mod 97, Base 10 (CNJ)
  // DV nas posições 7 e 8; para validar, desloca o DV para o final do número.
  const base = n.slice(0, 7) + n.slice(9) + n.slice(7, 9);
  let mod = 0;
  for (let i = 0; i < base.length; i++) {
    mod = (mod * 10 + parseInt(base[i], 10)) % 97;
  }
  if (mod !== 1) {
    return { valid: false, error: 'Dígitos verificadores do CNJ não conferem.' };
  }

  return { valid: true, normalized: n, formatted: formatProcessNumber(n) };
}

export function validateAndNormalizeCNJ(number) {
  return validateProcessNumber(number);
}

export function resolveDataJudAlias(tribunalCode) {
  const alias = resolveCourtAlias(tribunalCode);
  if (!alias) {
    return { ok: false, error: 'Tribunal ainda não habilitado para consulta automática via DataJud. Utilize o acompanhamento oficial e solicite a inclusão ao administrador.' };
  }
  return { ok: true, alias };
}

function getDataJudApiKey() {
  return process.env.DATAJUD_API_KEY;
}

export async function queryDataJud({ processNumber, tribunalCode, timeoutMs = 25000, requestId = 'datajud' }) {
  const validation = validateProcessNumber(processNumber);
  if (!validation.valid) {
    safeLog('warn', 'datajud_invalid_cnj', {
      requestId,
      reason: 'cnj_validation_failed',
      hasProcessNumber: !!processNumber,
    });
    return { status: 'invalid', error: validation.error };
  }

  const aliasRes = resolveDataJudAlias(tribunalCode);
  if (!aliasRes.ok) {
    safeLog('warn', 'datajud_invalid_court', {
      requestId,
      tribunalCode,
    });
    return { status: 'invalid', error: aliasRes.error };
  }

  if (!getDataJudApiKey()) {
    safeLog('error', 'datajud_key_missing', {
      requestId,
      tribunalCode,
    });
    return { status: 'error', error: 'Chave DataJud não configurada no servidor.' };
  }

  const url = `${DATAJUD_BASE_URL}/${aliasRes.alias}/_search`;
  const body = {
    query: {
      match: {
        numeroProcesso: validation.normalized
      }
    }
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `APIKey ${getDataJudApiKey()}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (response.status === 429) {
      safeLog('warn', 'datajud_rate_limited', {
        requestId,
        tribunalCode,
        status: response.status,
      });
      return { status: 'rate_limited', error: 'Limite de requisições atingido. Tente mais tarde.' };
    }
    if (response.status >= 500) {
      safeLog('warn', 'datajud_server_error', {
        requestId,
        tribunalCode,
        status: response.status,
      });
      return { status: 'error', error: 'Consulta temporariamente indisponível. Tente novamente mais tarde.' };
    }
    if (response.status === 401 || response.status === 403) {
      safeLog('warn', 'datajud_auth_error', {
        requestId,
        tribunalCode,
        status: response.status,
      });
      return { status: 'error', error: 'Autenticação com DataJud falhou. Verifique a API key.' };
    }

    const data = await response.json().catch(() => null);
    if (!data || !response.ok) {
      return { status: 'error', error: 'Resposta inválida do DataJud.' };
    }

    const hits = data?.hits?.hits || [];
    if (hits.length === 0) {
      safeLog('info', 'datajud_not_found', {
        requestId,
        tribunalCode,
      });
      return { status: 'not_found', error: 'Processo não localizado na fonte consultada. Confira número e tribunal.' };
    }

    const proc = hits[0]._source || {};
    const hasRestricted = proc.sigilo === 'Sigiloso' || proc.sigilo === 'Restrito';
    if (hasRestricted) {
      safeLog('info', 'datajud_restricted', {
        requestId,
        tribunalCode,
      });
      return { status: 'restricted', error: 'Dados não disponíveis pela fonte pública. Acompanhe pelo sistema oficial apropriado.' };
    }

    const rawMovements = (proc.movimentos || []).map((m, idx) => ({
      external_id: String(m.identificadorMovimento || m.sequencia || idx),
      date: m.dataHora,
      text: String(m.nome || m.descricao || '').trim()
    }));

    rawMovements.sort((a, b) => new Date(b.date) - new Date(a.date));

    const movements = rawMovements.slice(0, 30);
    const lastMovement = movements[0] || null;

    return {
      status: 'success',
      source: 'datajud',
      tribunalCode,
      processNumber: validation.normalized,
      processNumberFormatted: validation.formatted,
      court: {
        name: proc.tribunal || courtNameFromCode(tribunalCode),
        unit: proc.orgaoJulgador?.nome || proc.unidadeJudiciaria || null,
        instance: proc.instancia || null
      },
      caseClass: proc.classe?.nome || null,
      mainSubject: proc.assuntos?.map((a) => a.nome).join('; ') || null,
      distributionDate: proc.dataAjuizamento || null,
      lastMovement,
      movements,
      publicUrl: null
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      safeLog('warn', 'datajud_timeout', {
        requestId,
        tribunalCode,
        timeoutMs,
      });
      return { status: 'error', error: 'Timeout na consulta ao DataJud.' };
    }
    safeError('datajud_unexpected_error', err, {
      requestId,
      tribunalCode,
      timeoutMs,
    });
    return { status: 'error', error: 'Erro inesperado na consulta. Tente novamente mais tarde.' };
  }
}

function courtNameFromCode(code) {
  return getCourtName(code);
}
