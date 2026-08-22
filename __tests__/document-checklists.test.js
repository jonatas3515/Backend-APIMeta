/**
 * Testes sinteticos para Gestao de Documentos e Checklists (Implementation 054)
 * Nao usam dados reais de clientes nem Supabase.
 */

const {
  buildDocumentRequestMessage,
  isValidStatusForEstagiario,
  RESTRICTED_FIELDS_FOR_ESTAGIARIO,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_COLORS,
} = require('../lib/documentChecklists');

const { normalizeLegalArea, LEGAL_AREAS } = require('../lib/legalAreas');

describe('Documentos e Checklists - helpers', () => {
  test('buildDocumentRequestMessage gera texto sem PII, links ou promessas', () => {
    const items = [
      { title: 'Contrato', description: 'Contrato de compra' },
      { title: 'Nota fiscal', description: 'Comprovante de pagamento' },
    ];

    const { message, template_key } = buildDocumentRequestMessage(items);

    expect(typeof message).toBe('string');
    expect(message).toContain('Contrato');
    expect(message).toContain('Nota fiscal');
    expect(message).not.toContain('http');
    expect(message).not.toContain('www');
    expect(message).not.toContain('resultado');
    expect(message).not.toContain('prazo');
    expect(template_key).toBe('document_request_v1');
  });

  test('buildDocumentRequestMessage retorna vazio para itens sem titulo', () => {
    const { message } = buildDocumentRequestMessage([{ description: 'sem titulo' }]);
    expect(message).not.toContain('sem titulo');
  });

  test('isValidStatusForEstagiario permite apenas recebido e em_revisao', () => {
    expect(isValidStatusForEstagiario('recebido')).toBe(true);
    expect(isValidStatusForEstagiario('em_revisao')).toBe(true);
    expect(isValidStatusForEstagiario('revisado')).toBe(false);
    expect(isValidStatusForEstagiario('recusado')).toBe(false);
    expect(isValidStatusForEstagiario('dispensado')).toBe(false);
    expect(isValidStatusForEstagiario('pendente')).toBe(false);
    expect(isValidStatusForEstagiario('solicitado')).toBe(false);
  });

  test('RESTRICTED_FIELDS_FOR_ESTAGIARIO bloqueia campos sensiveis', () => {
    expect(RESTRICTED_FIELDS_FOR_ESTAGIARIO.has('case_id')).toBe(true);
    expect(RESTRICTED_FIELDS_FOR_ESTAGIARIO.has('is_sensitive')).toBe(true);
    expect(RESTRICTED_FIELDS_FOR_ESTAGIARIO.has('reviewed_by')).toBe(true);
    expect(RESTRICTED_FIELDS_FOR_ESTAGIARIO.has('dispense_reason')).toBe(true);
    expect(RESTRICTED_FIELDS_FOR_ESTAGIARIO.has('status')).toBe(false);
    expect(RESTRICTED_FIELDS_FOR_ESTAGIARIO.has('observacao')).toBe(false);
  });

  test('DOCUMENT_STATUS_LABELS contem todos os status em portugues', () => {
    expect(Object.keys(DOCUMENT_STATUS_LABELS).sort()).toEqual([
      'pendente',
      'solicitado',
      'recebido',
      'em_revisao',
      'revisado',
      'recusado',
      'dispensado'
    ].sort());
    expect(DOCUMENT_STATUS_LABELS['revisado']).toBe('Revisado');
    expect(DOCUMENT_STATUS_COLORS['revisado']).toBeTruthy();
  });

  test('normalizeLegalArea mapeia consumerista, consumidor legado e familia', () => {
    expect(normalizeLegalArea('consumidor')).toBe('consumerista');
    expect(normalizeLegalArea('consumerista')).toBe('consumerista');
    expect(normalizeLegalArea('direito do consumidor')).toBe('consumerista');
    expect(normalizeLegalArea('familia')).toBe('familia');
    expect(normalizeLegalArea('família')).toBe('familia');
    expect(normalizeLegalArea('trabalhista')).toBe('trabalhista');
  });

  test('LEGAL_AREAS inclui consumerista e familia', () => {
    const values = LEGAL_AREAS.map(a => a.value);
    expect(values).toContain('consumerista');
    expect(values).toContain('familia');
    expect(values).toContain('trabalhista');
    expect(values).toContain('previdenciario');
    expect(values).toContain('civel');
  });
});
