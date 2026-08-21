// Synthetic data for testing - NO REAL DATA
// All values are clearly marked as synthetic for PII detection tests

const SYNTHETIC_VALUES = {
  phone: 'TELEFONE-SINTETICO-5511999999999',
  phoneHash: 'hash_5511999999999_synthetic',
  email: 'EMAIL-SINTETICO-cliente.teste@exemplo.com',
  name: 'NOME-SINTETICO-CLIENTE',
  token: 'TOKEN-SINTETICO-TESTE',
  cpf: 'CPF-SINTETICO-12345678900',
  correlationId: 'CORRELATION-ID-SYNTHETIC-12345',
};

const SYNTHETIC_USER_ADMIN = {
  id: 'user-admin-synthetic-001',
  auth_user_id: 'auth-admin-synthetic-001',
  name: 'Admin Sintético',
  email: 'admin.sintetico@teste.com',
  role: 'admin',
  is_active: true,
};

const SYNTHETIC_USER_ADVOGADO = {
  id: 'user-advogado-synthetic-002',
  auth_user_id: 'auth-advogado-synthetic-002',
  name: 'Advogado Sintético',
  email: 'advogado.sintetico@teste.com',
  role: 'advogado',
  is_active: true,
};

const SYNTHETIC_USER_ESTAGIARIO = {
  id: 'user-estagiario-synthetic-003',
  auth_user_id: 'auth-estagiario-synthetic-003',
  name: 'Estagiário Sintético',
  email: 'estagiario.sintetico@teste.com',
  role: 'estagiario',
  is_active: true,
};

const SYNTHETIC_CONVERSATION = {
  id: 'conv-synthetic-001',
  client_phone: SYNTHETIC_VALUES.phone,
  client_name: SYNTHETIC_VALUES.name,
  legal_area: 'direito_do_trabalho',
  funnel_stage: 'intake_concluido',
  assigned_user_id: SYNTHETIC_USER_ADVOGADO.id,
};

const SYNTHETIC_CASE = {
  id: 'case-synthetic-001',
  conversation_id: SYNTHETIC_CONVERSATION.id,
  title: 'Caso Sintético - Licença Prêmio',
  legal_area: 'direito_do_trabalho',
  case_type: 'licenca_premio',
  status: 'em_analise',
  priority: 'media',
  assigned_user_id: SYNTHETIC_USER_ADVOGADO.id,
};

const SYNTHETIC_CASE_PROCESS = {
  id: 'process-synthetic-001',
  case_id: SYNTHETIC_CASE.id,
  process_number: '0000000-00.0000.0.00.0000',
  process_number_normalized: '00000000000000000000',
  court_code: 'TRT01',
  court_name: 'Tribunal Regional do Trabalho da 1ª Região',
  monitoring_status: 'ativo',
};

const SYNTHETIC_PROCESS_MOVEMENT = {
  id: 'movement-synthetic-001',
  case_process_id: SYNTHETIC_CASE_PROCESS.id,
  movement_date: '2024-01-15T10:00:00Z',
  movement_text: 'Juntada de petição - Documento sintético para testes',
  movement_text_normalized: 'juntada de peticao documento sintetico para testes',
  source: 'datajud',
  review_status: 'nova',
  triage_status: 'novo',
  legal_classification: 'ainda_nao_classificada',
  priority: 'media',
};

const SYNTHETIC_KNOWLEDGE_DOC_DRAFT = {
  id: 'doc-draft-synthetic-001',
  title: 'Documento Rascunho Sintético',
  content: 'Conteúdo de rascunho que não deve aparecer na busca',
  status: 'draft',
  legal_area: 'direito_do_trabalho',
};

const SYNTHETIC_KNOWLEDGE_DOC_APPROVED = {
  id: 'doc-approved-synthetic-001',
  title: 'Documento Aprovado Sintético',
  content: 'Conteúdo aprovado que pode aparecer na busca RAG',
  status: 'approved',
  legal_area: 'direito_do_trabalho',
};

module.exports = {
  SYNTHETIC_VALUES,
  SYNTHETIC_USER_ADMIN,
  SYNTHETIC_USER_ADVOGADO,
  SYNTHETIC_USER_ESTAGIARIO,
  SYNTHETIC_CONVERSATION,
  SYNTHETIC_CASE,
  SYNTHETIC_CASE_PROCESS,
  SYNTHETIC_PROCESS_MOVEMENT,
  SYNTHETIC_KNOWLEDGE_DOC_DRAFT,
  SYNTHETIC_KNOWLEDGE_DOC_APPROVED,
};
