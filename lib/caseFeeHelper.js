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

  // 1. Extrai de notes se estiver serializado como [HONORARIOS: {...}]
  let parsed = null;
  if (caseItem.notes && typeof caseItem.notes === 'string' && caseItem.notes.includes('[HONORARIOS:')) {
    try {
      const match = caseItem.notes.match(/\[HONORARIOS:\s*({.*?})\]/s);
      if (match && match[1]) {
        parsed = JSON.parse(match[1]);
      }
    } catch {}
  }

  const fee_type = parsed?.fee_type || caseItem.fee_type || 'percentual';
  const fee_percentage = parsed?.fee_percentage != null ? Number(parsed.fee_percentage) : (caseItem.fee_percentage != null ? Number(caseItem.fee_percentage) : 30);
  const fee_basis = parsed?.fee_basis || caseItem.fee_basis || 'condenacao';
  const awarded_value = parsed?.awarded_value != null ? Number(parsed.awarded_value) : (caseItem.awarded_value != null ? Number(caseItem.awarded_value) : null);
  const fee_fixed_value = parsed?.fee_fixed_value != null ? Number(parsed.fee_fixed_value) : (caseItem.fee_fixed_value != null ? Number(caseItem.fee_fixed_value) : null);

  // Se tiver condenação e for sobre condenação, calcula sempre sobre a condenação real!
  let fee_final_value = null;
  if (fee_type === 'fixo') {
    fee_final_value = Number(fee_fixed_value) || 0;
  } else if ((fee_basis === 'condenacao' || fee_basis === 'acordo') && awarded_value != null && Number(awarded_value) > 0) {
    fee_final_value = Number((Number(awarded_value) * (fee_percentage / 100)).toFixed(2));
  } else if (parsed?.fee_final_value != null) {
    fee_final_value = Number(Number(parsed.fee_final_value).toFixed(2));
  } else if (caseItem.fee_final_value != null) {
    fee_final_value = Number(Number(caseItem.fee_final_value).toFixed(2));
  } else {
    fee_final_value = calculateFeeAmount({
      fee_type,
      fee_percentage,
      fee_basis,
      awarded_value,
      fee_fixed_value,
      case_value: caseItem.case_value
    });
  }

  return {
    fee_type,
    fee_percentage,
    fee_basis,
    awarded_value,
    fee_fixed_value,
    fee_final_value
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
      return Number((Number(awarded_value) * pct).toFixed(2));
    }
  }

  // Se a base é a causa
  if (fee_basis === 'causa') {
    if (case_value != null && Number(case_value) > 0) {
      return Number((Number(case_value) * pct).toFixed(2));
    }
  }

  // Caso contrário ou antes da sentença, estima provisoriamente sobre o valor da causa
  const causa = Number(case_value) || 0;
  return causa > 0 ? Number((causa * pct).toFixed(2)) : 0;
}

export function stripFeeFromNotes(notes) {
  if (!notes || typeof notes !== 'string') return '';
  return notes.replace(/\[HONORARIOS:\s*\{.*?\}\]\s*/gs, '').trim();
}

export function serializeFeeIntoNotes(existingNotes, feeData) {
  let notes = stripFeeFromNotes(existingNotes);

  const pct = Number(feeData.fee_percentage) || 30;
  const valCond = feeData.awarded_value != null && feeData.awarded_value !== '' ? Number(feeData.awarded_value) : null;
  const basis = feeData.fee_basis || 'condenacao';
  const type = feeData.fee_type || 'percentual';
  const fixed = feeData.fee_fixed_value != null && feeData.fee_fixed_value !== '' ? Number(feeData.fee_fixed_value) : null;

  let finalVal = feeData.fee_final_value != null && feeData.fee_final_value !== '' ? Number(feeData.fee_final_value) : null;
  if (type === 'fixo') {
    finalVal = fixed;
  } else if ((basis === 'condenacao' || basis === 'acordo') && valCond != null && valCond > 0) {
    finalVal = Number((valCond * (pct / 100)).toFixed(2));
  }

  const payload = {
    fee_type: type,
    fee_percentage: pct,
    fee_basis: basis,
    awarded_value: valCond,
    fee_fixed_value: fixed,
    fee_final_value: finalVal != null ? Number(finalVal.toFixed(2)) : null
  };

  const tag = `[HONORARIOS: ${JSON.stringify(payload)}]`;
  return notes ? `${notes}\n\n${tag}` : tag;
}
