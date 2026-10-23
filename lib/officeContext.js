// ============================================================================
// Contexto de escritório (multi-tenancy)
// ============================================================================
// O escritório matriz "Neves & Costa" usa UUID fixo para ser o padrão absoluto
// de todos os dados existentes e novos registros sem office_id informado.
// ============================================================================

export const DEFAULT_OFFICE_ID = '00000000-0000-0000-0000-000000000001';

export function getDefaultOfficeId() {
  return process.env.DEFAULT_OFFICE_ID || DEFAULT_OFFICE_ID;
}
