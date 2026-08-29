/**
 * Testes de segurança: RAG deve usar APENAS documentos aprovados.
 */

const { searchKnowledge } = require('../lib/knowledgeSearch');
const { supabaseServer } = require('../lib/supabaseServer');

jest.mock('../lib/supabaseServer', () => ({
  supabaseServer: { rpc: jest.fn() }
}));

describe('RAG - apenas documentos aprovados', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('searchKnowledge rejeita status draft', async () => {
    await expect(searchKnowledge({ query: 'teste', status: 'draft' }))
      .rejects.toThrow('Apenas documentos aprovados podem ser consultados');
  });

  test('searchKnowledge rejeita status review', async () => {
    await expect(searchKnowledge({ query: 'teste', status: 'review' }))
      .rejects.toThrow('Apenas documentos aprovados podem ser consultados');
  });

  test('searchKnowledge rejeita status reprovado', async () => {
    await expect(searchKnowledge({ query: 'teste', status: 'reprovado' }))
      .rejects.toThrow('Apenas documentos aprovados podem ser consultados');
  });

  test('searchKnowledge rejeita status vazio/qualquer', async () => {
    await expect(searchKnowledge({ query: 'teste', status: 'rascunho' }))
      .rejects.toThrow('Apenas documentos aprovados podem ser consultados');
  });

  test('searchKnowledge chama RPC com filter_status aprovado', async () => {
    supabaseServer.rpc.mockResolvedValue({ data: [], error: null });
    await searchKnowledge({ query: 'teste' });
    expect(supabaseServer.rpc).toHaveBeenCalledWith('search_knowledge', expect.objectContaining({
      filter_status: 'aprovado'
    }));
  });

  test('searchKnowledge chama RPC com status aprovado mesmo sem argumento', async () => {
    supabaseServer.rpc.mockResolvedValue({
      data: [
        { document_id: 'doc-approved-001', title: 'Aprovado', doc_type: 'template', area: 'trabalho', tribunal: 'TRT', tags: [], content: 'Conteúdo aprovado' }
      ],
      error: null
    });
    const { documents } = await searchKnowledge({ query: 'teste' });
    expect(supabaseServer.rpc).toHaveBeenCalledWith('search_knowledge', expect.objectContaining({
      filter_status: 'aprovado'
    }));
    expect(documents.length).toBe(1);
    expect(documents[0].title).toBe('Aprovado');
  });
});
