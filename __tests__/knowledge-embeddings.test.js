/**
 * @jest-environment node
 */

import { semanticSearch } from '../lib/knowledge-embeddings';

jest.mock('../lib/logger', () => () => {});

describe('lib/knowledge-embeddings', () => {
  test('semanticSearch retorna chunks e documentos únicos', async () => {
    const supabase = {
      rpc: jest.fn().mockResolvedValue({
        data: [
          { document_id: 'd-001', chunk_index: 0, content: 'Trecho A', title: 'Tese', doc_type: 'tese', area: 'cível', tribunal: 'TJSP', tags: ['tese'] },
          { document_id: 'd-001', chunk_index: 1, content: 'Trecho B', title: 'Tese', doc_type: 'tese', area: 'cível', tribunal: 'TJSP', tags: ['tese'] },
          { document_id: 'd-002', chunk_index: 0, content: 'Trecho C', title: 'Súmula', doc_type: 'sumula', area: 'trabalhista', tribunal: 'TST', tags: ['sumula'] }
        ],
        error: null
      })
    };

    const result = await semanticSearch(supabase, { query: 'danos morais', topK: 3 });
    expect(result.chunks.length).toBe(3);
    expect(result.documents.length).toBe(2);
    expect(result.documents.map(d => d.documentId)).toContain('d-001');
    expect(result.documents.map(d => d.documentId)).toContain('d-002');
  });

  test('semanticSearch rejeita query muito curta', async () => {
    const supabase = { rpc: jest.fn() };
    await expect(semanticSearch(supabase, { query: 'a' })).rejects.toThrow('query deve ter pelo menos 3 caracteres');
  });
});
