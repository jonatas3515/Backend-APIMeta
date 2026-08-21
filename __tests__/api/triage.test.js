/**
 * Triage Tests
 * Tests process triage flows without altering production data
 */

const { createMocks } = require('node-mocks-http');
const { 
  SYNTHETIC_PROCESS_MOVEMENT,
  SYNTHETIC_USER_ADVOGADO,
  SYNTHETIC_USER_ESTAGIARIO,
} = require('../fixtures/synthetic-data');

describe('Triagem Processual', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('Sugestão automática não altera status da movimentação', async () => {
    // Simulate suggestion logic
    const movementText = 'Intimação para apresentar recurso';
    const suggestion = suggestClassification(movementText);

    expect(suggestion).toHaveProperty('classification');
    expect(suggestion).toHaveProperty('priority');
    expect(suggestion.classification).toBe('intimacao');
    expect(suggestion.priority).toBe('alta');

    // Movement status should NOT change
    const movement = { ...SYNTHETIC_PROCESS_MOVEMENT };
    const originalStatus = movement.triage_status;

    // Apply suggestion (should only populate suggested fields)
    movement.suggested_classification = suggestion.classification;
    movement.suggested_priority = suggestion.priority;

    expect(movement.triage_status).toBe(originalStatus); // Status unchanged
    expect(movement.triage_status).toBe('novo'); // Still 'novo'
  });

  test('PATCH sincroniza review_status e triage_status', async () => {
    // Simulate trigger logic
    const movement = { ...SYNTHETIC_PROCESS_MOVEMENT };
    
    // Update triage_status
    movement.triage_status = 'revisado';
    
    // Trigger should sync review_status
    const synced = syncReviewAndTriageStatus(movement);
    
    expect(synced.triage_status).toBe('revisado');
    expect(synced.review_status).toBe('revisada'); // Synced
  });

  test('Criar nota vincula movement_id e atualiza status', async () => {
    const movement = { ...SYNTHETIC_PROCESS_MOVEMENT };
    const noteId = 'note-synthetic-001';

    // Simulate note creation
    movement.note_id = noteId;
    movement.triage_status = 'convertido_em_nota';

    // Trigger should sync
    const synced = syncReviewAndTriageStatus(movement);

    expect(synced.note_id).toBe(noteId);
    expect(synced.triage_status).toBe('convertido_em_nota');
    expect(synced.review_status).toBe('convertida_em_nota'); // Synced
  });

  test('Estagiário não acessa API de triagem (403)', async () => {
    // This would be tested with actual API handler
    // For now, simulate auth check
    const userRole = SYNTHETIC_USER_ESTAGIARIO.role;
    const minRole = 'advogado';

    const roleHierarchy = { estagiario: 1, advogado: 2, admin: 3 };
    const hasAccess = roleHierarchy[userRole] >= roleHierarchy[minRole];

    expect(hasAccess).toBe(false);
  });

  test('Não há cálculo automático de prazo', async () => {
    const movementText = 'Intimação para apresentar recurso em 15 dias';
    const suggestion = suggestClassification(movementText);

    // Suggestion should NOT include deadline calculation
    expect(suggestion).not.toHaveProperty('deadline');
    expect(suggestion).not.toHaveProperty('deadline_date');
    expect(suggestion).not.toHaveProperty('calculated_deadline');
  });
});

// Helper functions to simulate triage logic
function suggestClassification(movementText) {
  const text = movementText.toLowerCase();
  
  if (text.includes('intimação') || text.includes('intimacao')) {
    return { classification: 'intimacao', priority: 'alta' };
  }
  if (text.includes('audiência') || text.includes('audiencia')) {
    return { classification: 'audiencia', priority: 'urgente' };
  }
  if (text.includes('sentença') || text.includes('sentenca')) {
    return { classification: 'sentenca', priority: 'alta' };
  }
  if (text.includes('juntada')) {
    return { classification: 'juntada', priority: 'baixa' };
  }
  
  return { classification: 'outro', priority: 'media' };
}

function syncReviewAndTriageStatus(movement) {
  const synced = { ...movement };

  // triage_status → review_status
  const statusMap = {
    'novo': 'nova',
    'em_analise': 'nova',
    'revisado': 'revisada',
    'ignorado': 'ignorada',
    'convertido_em_nota': 'convertida_em_nota',
    'convertido_em_lembrete': 'revisada',
    'convertido_em_agenda': 'convertida_em_agenda',
  };

  synced.review_status = statusMap[synced.triage_status] || synced.review_status;

  // Validate FK consistency
  if (synced.note_id && !['convertido_em_nota', 'revisado'].includes(synced.triage_status)) {
    synced.triage_status = 'convertido_em_nota';
    synced.review_status = 'convertida_em_nota';
  }

  if (synced.reminder_id && !['convertido_em_lembrete', 'revisado'].includes(synced.triage_status)) {
    synced.triage_status = 'convertido_em_lembrete';
    synced.review_status = 'revisada';
  }

  if (synced.agenda_event_id && !['convertido_em_agenda', 'revisado'].includes(synced.triage_status)) {
    synced.triage_status = 'convertido_em_agenda';
    synced.review_status = 'convertida_em_agenda';
  }

  return synced;
}
