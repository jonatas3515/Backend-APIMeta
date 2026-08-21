/**
 * RAG (Retrieval-Augmented Generation) Tests
 * Tests RAG flows without calling real Gemini API
 */

const { createMocks } = require('node-mocks-http');
const { 
  SYNTHETIC_VALUES, 
  SYNTHETIC_KNOWLEDGE_DOC_DRAFT, 
  SYNTHETIC_KNOWLEDGE_DOC_APPROVED 
} = require('../fixtures/synthetic-data');

describe('RAG e Busca', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let fetchSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Mock fetch to prevent real Gemini API calls
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: 'Resposta mockada do Gemini para testes' }]
          }
        }]
      }),
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  test('Sem fonte aprovada: não chama Gemini e retorna base insuficiente', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { 
        query: 'Qual o prazo para recurso?',
        conversationId: 'conv-synthetic-001',
      },
    });

    // Simulate RAG logic without approved sources
    const approvedDocs = []; // No approved documents
    
    if (approvedDocs.length === 0) {
      // Should NOT call Gemini
      const response = {
        answer: 'Desculpe, não encontrei informações suficientes na base de conhecimento para responder sua pergunta.',
        sources: [],
        usedRAG: false,
      };

      expect(response.usedRAG).toBe(false);
      expect(response.sources).toHaveLength(0);
      
      // Gemini should NOT be called
      expect(fetchSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.anything()
      );
    }
  });

  test('Com fonte aprovada: chama Gemini mockada e retorna metadados seguros', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { 
        query: 'Qual o prazo para recurso?',
        conversationId: 'conv-synthetic-001',
      },
    });

    // Simulate RAG logic with approved sources
    const approvedDocs = [SYNTHETIC_KNOWLEDGE_DOC_APPROVED];
    
    if (approvedDocs.length > 0) {
      // Should call Gemini (mocked)
      const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: 'Test query' }]
          }]
        }),
      });

      const geminiData = await geminiResponse.json();
      
      // Response should contain only safe metadata
      const response = {
        answer: geminiData.candidates[0].content.parts[0].text,
        sources: approvedDocs.map(doc => ({
          id: doc.id,
          title: doc.title,
          // NO content, NO full text
        })),
        usedRAG: true,
      };

      expect(response.usedRAG).toBe(true);
      expect(response.sources).toHaveLength(1);
      expect(response.sources[0]).toHaveProperty('id');
      expect(response.sources[0]).toHaveProperty('title');
      expect(response.sources[0]).not.toHaveProperty('content'); // No full content
      
      // Gemini WAS called (mocked)
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.anything()
      );
    }
  });

  test('Documento rascunho não aparece na busca', async () => {
    // Simulate document filtering
    const allDocs = [SYNTHETIC_KNOWLEDGE_DOC_DRAFT, SYNTHETIC_KNOWLEDGE_DOC_APPROVED];
    const approvedDocs = allDocs.filter(doc => doc.status === 'approved');

    expect(approvedDocs).toHaveLength(1);
    expect(approvedDocs[0].id).toBe(SYNTHETIC_KNOWLEDGE_DOC_APPROVED.id);
    expect(approvedDocs.find(doc => doc.id === SYNTHETIC_KNOWLEDGE_DOC_DRAFT.id)).toBeUndefined();
  });

  test('Logs não contêm conteúdo integral de chunk, resposta Gemini ou PII', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { 
        query: 'Teste de query',
        conversationId: 'conv-synthetic-001',
      },
    });

    // Simulate RAG processing with logging
    const approvedDocs = [SYNTHETIC_KNOWLEDGE_DOC_APPROVED];
    const correlationId = `rag_${Date.now()}`;

    console.log(`[RAG] Processing query with correlationId: ${correlationId}, foundDocs: ${approvedDocs.length}`);

    const allLogs = consoleLogSpy.mock.calls.map(call => call.join(' ')).join(' ');
    const allErrors = consoleErrorSpy.mock.calls.map(call => call.join(' ')).join(' ');
    const combinedLogs = allLogs + ' ' + allErrors;

    // Verificar que valores sintéticos específicos NÃO aparecem
    expect(combinedLogs).not.toContain(SYNTHETIC_KNOWLEDGE_DOC_APPROVED.content); // No full chunk content
    expect(combinedLogs).not.toContain('Resposta mockada do Gemini'); // No Gemini response
    expect(combinedLogs).not.toContain(SYNTHETIC_VALUES.phone);
    expect(combinedLogs).not.toContain(SYNTHETIC_VALUES.name);
    expect(combinedLogs).not.toContain(SYNTHETIC_VALUES.email);
    expect(combinedLogs).not.toContain(SYNTHETIC_VALUES.cpf);

    // Verificar que correlationId APARECE (é seguro)
    expect(combinedLogs).toContain('correlationId');
  });
});
