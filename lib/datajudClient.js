/**
 * Cliente leve para consulta pública ao DataJud/CNJ.
 * Nunca registra a API key, headers ou respostas completas.
 */

import { DATAJUD_BASE_URL, resolveCourtAlias, getCourtName } from './datajudCourts';

const DATAJUD_API_KEY = process.env.DATAJUD_API_KEY;

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
  // Verificador simples dos dígitos do CNJ
  const digits = n.split('').map(Number);
  const seq = digits.slice(0, 7).concat(digits.slice(9, 20));
  const digito = (digits[7] * 10) + digits[8];
  let mod = 0;
  for (let i = 0; i < seq.length; i++) {
    const multiplier = seq.length - i;
    mod += seq[i] * multiplier;
  }
  const rest = mod % 97;
  const calculated = 98 - rest;
  if (calculated !== digito) {
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

export async function queryDataJud({ processNumber, tribunalCode, timeoutMs = 25000 }) {
  const validation = validateProcessNumber(processNumber);
  if (!validation.valid) {
    return { status: 'invalid', error: validation.error };
  }

  const aliasRes = resolveDataJudAlias(tribunalCode);
  if (!aliasRes.ok) {
    return { status: 'invalid', error: aliasRes.error };
  }

  if (!DATAJUD_API_KEY) {
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
        'Authorization': `APIKey ${DATAJUD_API_KEY}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (response.status === 429) {
      return { status: 'rate_limited', error: 'Limite de requisições atingido. Tente mais tarde.' };
    }
    if (response.status >= 500) {
      return { status: 'error', error: 'Consulta temporariamente indisponível. Tente novamente mais tarde.' };
    }
    if (response.status === 401 || response.status === 403) {
      return { status: 'error', error: 'Autenticação com DataJud falhou. Verifique a API key.' };
    }

    const data = await response.json().catch(() => null);
    if (!data || !response.ok) {
      return { status: 'error', error: 'Resposta inválida do DataJud.' };
    }

    const hits = data?.hits?.hits || [];
    if (hits.length === 0) {
      return { status: 'not_found', error: 'Processo não localizado na fonte consultada. Confira número e tribunal.' };
    }

    const proc = hits[0]._source || {};
    const hasRestricted = proc.sigilo === 'Sigiloso' || proc.sigilo === 'Restrito';
    if (hasRestricted) {
      return { status: 'restricted', error: 'Dados não disponíveis pela fonte pública. Acompanhe pelo sistema oficial apropriado.' };
    }

    const movements = (proc.movimentos || []).slice(0, 30).map((m, idx) => ({
      external_id: String(m.identificadorMovimento || m.sequencia || idx),
      date: m.dataHora,
      text: String(m.nome || m.descricao || '').trim()
    }));

    movements.sort((a, b) => new Date(b.date) - new Date(a.date));

    const lastMovement = movements[0] || null;

    return {
      status: 'success',
      source: 'datajud',
      tribunalCode,
      alias: aliasRes.alias,
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
      return { status: 'error', error: 'Timeout na consulta ao DataJud.' };
    }
    console.error('[DATAJUD] Erro inesperado:', err.message);
    return { status: 'error', error: 'Erro inesperado na consulta. Tente novamente mais tarde.' };
  }
}

function courtNameFromCode(code) {
  return getCourtName(code);
}
