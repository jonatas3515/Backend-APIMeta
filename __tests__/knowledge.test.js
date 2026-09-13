/**
 * @jest-environment node
 */

import {
  validateDocument,
  normalizeDocument,
  normalizeDetail,
  getDocument,
  VALID_TYPES
} from '../lib/knowledge';

jest.mock('../lib/logger', () => () => {});

describe('lib/knowledge', () => {
  test('VALID_TYPES contém os cinco tipos permitidos', () => {
    expect(VALID_TYPES).toEqual(['tese', 'jurisprudencia', 'modelo', 'lei', 'sumula']);
  });

  test('validateDocument aceita payload válido', () => {
    const payload = {
      title: 'Tese sobre danos morais',
      type: 'tese',
      content: 'Texto jurídico com mais de dez caracteres.',
      summary: 'Resumo sintético',
      tags: ['danos morais', 'cobrança indevida']
    };
    const result = validateDocument(payload);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('validateDocument rejeita título curto, tipo inválido e conteúdo curto', () => {
    const result = validateDocument({ title: 'A', type: 'artigo', content: 'curto' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('title deve ter pelo menos 3 caracteres');
    expect(result.errors).toContain('type inválido. Permitidos: tese, jurisprudencia, modelo, lei, sumula');
    expect(result.errors).toContain('content deve ter pelo menos 10 caracteres');
  });

  test('normalizeDocument padroniza campos expostos', () => {
    const row = {
      id: 'd-001',
      title: 'Modelo de petição',
      type: 'modelo',
      summary: 'Resumo',
      status: 'aprovado',
      tags: ['petição'],
      area: 'cível',
      tribunal: 'TJSP',
      version: 1,
      created_at: '2026-01-10T10:00:00Z',
      updated_at: '2026-01-11T10:00:00Z',
      chunk_count: 4
    };
    const doc = normalizeDocument(row);
    expect(doc.id).toBe('d-001');
    expect(doc.title).toBe('Modelo de petição');
    expect(doc.type).toBe('modelo');
    expect(doc.createdAt).toBe('2026-01-10T10:00:00Z');
    expect(doc.chunkCount).toBe(4);
  });

  test('normalizeDetail inclui content', () => {
    const row = { id: 'd-002', title: 'Súmula', type: 'sumula', content: 'Texto', created_at: '2026-01-10T10:00:00Z', updated_at: '2026-01-10T10:00:00Z' };
    const doc = normalizeDetail(row);
    expect(doc.content).toBe('Texto');
  });

  test('getDocument retorna detalhes de um documento', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: {
                id: 'd-003',
                title: 'Jurisprudência STJ',
                type: 'jurisprudencia',
                content: 'Texto da jurisprudência',
                summary: 'Resumo',
                status: 'aprovado',
                tags: ['stj'],
                area: null,
                tribunal: 'STJ',
                version: 'v1.0',
                created_at: '2026-01-10T10:00:00Z',
                updated_at: '2026-01-10T10:00:00Z'
              },
              error: null
            })
          })
        })
      })
    };

    const doc = await getDocument(supabase, 'd-003');
    expect(doc).not.toBeNull();
    expect(doc.title).toBe('Jurisprudência STJ');
    expect(doc.content).toBe('Texto da jurisprudência');
  });
});
