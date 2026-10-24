/**
 * Utilitários de cálculo e persistência de honorários advocatícios por caso.
 * Suporta percentual customizado (20%, 30%, etc.), valor fixo,
 * base sobre valor da condenação/acordo ou sobre o valor da causa.
 */

export function parseCaseFee(caseItem) {
  if (!caseItem) {
    return {
      fee_type: 'percentual',
      fee_percentage: 30,
      fee_basis: 'condenacao',
      awarded_value: null,
      fee_fixed_value: null,
      fee_final_value: null
    };
  }

  // 1. Se colunas nativas existirem no objeto
  if (
    caseItem.fee_final_value !== undefined ||
    caseItem.fee_percentage !== undefined ||
    caseItem.awarded_value !== undefined
  ) {
    const fee_type = caseItem.fee_type || 'percentual';
    const fee_percentage = caseItem.fee_percentage != null ? Number(caseItem.fee_percentage) : 30;
    const fee_basis = caseItem.fee_basis || 'condenacao';
    const awarded_value = caseItem.awarded_value != null ? Number(caseItem.awarded_value) : null;
    const fee_fixed_value = caseItem.fee_fixed_value != null ? Number(caseItem.fee_fixed_value) : null;
    const fee_final_value = caseItem.fee_final_value != null ? Number(caseItem.fee_final_value) : null;

    return {
      fee_type,
      fee_percentage,
      fee_basis,
      awarded_value,
      fee_fixed_value,
      fee_final_value: fee_final_value != null ? fee_final_value : calculateFeeAmount({
        fee_type,
        fee_percentage,
        fee_basis,
        awarded_value,
        fee_fixed_value,
        case_value: caseItem.case_value
      })
    };
  }

  // 2. Extrai de notes se estiver serializado como [HONORARIOS: {...}]
  if (caseItem.notes && typeof caseItem.notes === 'string' && caseItem.notes.includes('[HONORARIOS:')) {
    try {
      const match = caseItem.notes.match(/\[HONORARIOS:\s*({.*?})\]/s);
      if (match && match[1]) {
        const parsed = JSON.parse(match[1]);
        return {
          fee_type: parsed.fee_type || 'percentual',
          fee_percentage: parsed.fee_percentage != null ? Number(parsed.fee_percentage) : 30,
          fee_basis: parsed.fee_basis || 'condenacao',
          awarded_value: parsed.awarded_value != null ? Number(parsed.awarded_value) : null,
          fee_fixed_value: parsed.fee_fixed_value != null ? Number(parsed.fee_fixed_value) : null,
          fee_final_value: parsed.fee_final_value != null ? Number(parsed.fee_final_value) : calculateFeeAmount({
            fee_type: parsed.fee_type,
            fee_percentage: parsed.fee_percentage,
            fee_basis: parsed.fee_basis,
            awarded_value: parsed.awarded_value,
            fee_fixed_value: parsed.fee_fixed_value,
            case_value: caseItem.case_value
          })
        };
      }
    } catch {}
  }

  // 3. Fallback inteligente
  const caseVal = Number(caseItem.case_value) || 0;
  return {
    fee_type: 'percentual',
    fee_percentage: 30,
    fee_basis: 'condenacao',
    awarded_value: null,
    fee_fixed_value: null,
    fee_final_value: caseVal > 0 ? caseVal * 0.30 : null
  };
}

export function calculateFeeAmount({ fee_type, fee_percentage, fee_basis, awarded_value, fee_fixed_value, case_value }) {
  if (fee_type === 'fixo') {
    return Number(fee_fixed_value) || 0;
  }

  const pct = (Number(fee_percentage) || 30) / 100;

  // Se a base é a condenação/acordo e já temos o valor fixado
  if (fee_basis === 'condenacao' || fee_basis === 'acordo') {
    if (awarded_value != null && Number(awarded_value) > 0) {
      return Number(awarded_value) * pct;
    }
  }

  // Caso contrário ou antes da sentença, estima provisoriamente sobre o valor da causa
  const causa = Number(case_value) || 0;
  return causa > 0 ? causa * pct : 0;
}

export function serializeFeeIntoNotes(existingNotes, feeData) {
  let notes = (existingNotes || '').trim();
  // Remove bloco antigo de honorários se existir
  notes = notes.replace(/\[HONORARIOS:\s*{.*?}\]/gs, '').trim();

  const payload = {
    fee_type: feeData.fee_type || 'percentual',
    fee_percentage: Number(feeData.fee_percentage) || 30,
    fee_basis: feeData.fee_basis || 'condenacao',
    awarded_value: feeData.awarded_value != null && feeData.awarded_value !== '' ? Number(feeData.awarded_value) : null,
    fee_fixed_value: feeData.fee_fixed_value != null && feeData.fee_fixed_value !== '' ? Number(feeData.fee_fixed_value) : null,
    fee_final_value: feeData.fee_final_value != null && feeData.fee_final_value !== '' ? Number(feeData.fee_final_value) : null
  };

  const tag = `[HONORARIOS: ${JSON.stringify(payload)}]`;
  return notes ? `${notes}\n\n${tag}` : tag;
}
