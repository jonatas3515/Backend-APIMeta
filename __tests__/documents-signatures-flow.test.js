/**
 * Testes do fluxo Casos -> Checklist -> Documentos -> Assinaturas.
 * Tudo mockado: sem banco, sem WhatsApp, sem Zapsign real.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks de frontend
// ---------------------------------------------------------------------------
const mockApiJson = jest.fn();
jest.mock('../lib/apiClient', () => ({
  apiJson: (...args) => mockApiJson(...args),
  apiCall: jest.fn(),
}));

jest.mock('../lib/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', role: 'admin' } }),
}));

// ---------------------------------------------------------------------------
// Mocks de backend (endpoints)
// ---------------------------------------------------------------------------
let mockUser = { id: 'user-1', role: 'admin', auth_user_id: 'auth-1' };
const mockAdminFrom = jest.fn();
jest.mock('../lib/auth', () => ({
  withAuth: (handler) => async (req, res) => {
    req.user = mockUser;
    return handler(req, res);
  },
  supabaseAdmin: {
    from: (...args) => mockAdminFrom(...args),
    auth: { getUser: jest.fn() },
  },
}));

const mockAnonFrom = jest.fn();
jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => mockAnonFrom(...args),
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'auth-1' } }, error: null })),
    },
  },
}));

jest.mock('../lib/webhookLog', () => ({ sanitizeError: (e) => e }));
jest.mock('../lib/storage', () => ({
  getSignedUrl: jest.fn(() => Promise.resolve('https://signed.example.com')),
  uploadCaseFile: jest.fn(() => Promise.resolve('path/file.pdf')),
}));
jest.mock('../lib/whatsapp', () => ({ sendWhatsAppMessage: jest.fn(() => Promise.resolve('wa-1')) }));

// Chainable supabase query builder que tambem eh "thenable"
function chain(result) {
  const c = {};
  ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'in', 'is', 'order', 'limit']
    .forEach((m) => { c[m] = jest.fn(() => c); });
  c.single = jest.fn(() => Promise.resolve(result));
  c.maybeSingle = jest.fn(() => Promise.resolve(result));
  c.then = (resolve) => resolve(result);
  return c;
}

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.end = jest.fn(() => res);
  return res;
}

const caseItem = { id: 'case-1', title: 'Caso Teste', case_type: 'tipo', conversation_id: 'conv-1' };

beforeEach(() => {
  mockApiJson.mockReset();
  mockAdminFrom.mockReset();
  mockAnonFrom.mockReset();
  mockUser = { id: 'user-1', role: 'admin', auth_user_id: 'auth-1' };
  global.alert = jest.fn();
  global.confirm = jest.fn(() => true);
});

// ---------------------------------------------------------------------------
// 1. DocumentChecklist
// ---------------------------------------------------------------------------
describe('DocumentChecklist', () => {
  const DocumentChecklist = require('../components/DocumentChecklist').default;

  function setupApi(items = []) {
    mockApiJson.mockImplementation((url) => {
      if (url.includes('document-checklist-templates')) return Promise.resolve([]);
      if (url.includes('document-checklists')) return Promise.resolve(items);
      return Promise.resolve([]);
    });
  }

  test('criar item usa POST com JSON serializado', async () => {
    setupApi();
    render(<DocumentChecklist caseItem={caseItem} onClose={jest.fn()} />);
    await waitFor(() => expect(mockApiJson).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('Novo documento...'), { target: { value: 'RG' } });
    fireEvent.click(screen.getByText('+ Adicionar'));

    await waitFor(() => {
      const call = mockApiJson.mock.calls.find(c => c[0] === '/api/document-checklists');
      expect(call).toBeTruthy();
      expect(call[1].method).toBe('POST');
      expect(call[1].headers['Content-Type']).toBe('application/json');
      const body = JSON.parse(call[1].body);
      expect(body.case_id).toBe('case-1');
      expect(body.document_name).toBe('RG');
    });
  });

  test('criar template usa POST com JSON serializado', async () => {
    setupApi();
    render(<DocumentChecklist caseItem={caseItem} onClose={jest.fn()} />);
    await waitFor(() => expect(mockApiJson).toHaveBeenCalled());

    fireEvent.click(screen.getByText(/Gerenciar templates/));
    fireEvent.change(screen.getByPlaceholderText('Nome do documento padrao...'), { target: { value: 'CNH' } });
    fireEvent.click(screen.getByText('+ Template'));

    await waitFor(() => {
      const call = mockApiJson.mock.calls.find(c => c[0] === '/api/document-checklist-templates' && c[1]?.method === 'POST');
      expect(call).toBeTruthy();
      const body = JSON.parse(call[1].body);
      expect(body.document_name).toBe('CNH');
    });
  });

  test('remover item usa DELETE sem body', async () => {
    setupApi([{ id: 'item-1', title: 'RG', status: 'pendente' }]);
    render(<DocumentChecklist caseItem={caseItem} onClose={jest.fn()} />);
    await waitFor(() => screen.getByText('RG'));

    fireEvent.click(screen.getByText('✕'));

    await waitFor(() => {
      const call = mockApiJson.mock.calls.find(c => c[0] === '/api/document-checklists?id=item-1');
      expect(call).toBeTruthy();
      expect(call[1].method).toBe('DELETE');
      expect(call[1].body).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. CaseDocumentsPanel
// ---------------------------------------------------------------------------
describe('CaseDocumentsPanel', () => {
  const CaseDocumentsPanel = require('../components/CaseDocumentsPanel').default;

  test('carrega checklist do caso e faz PATCH de vinculo com JSON', async () => {
    mockApiJson.mockImplementation((url) => {
      if (url.includes('/api/case-documents?id=')) {
        return Promise.resolve({ id: 'doc-1', checklist_item_id: 'item-1' });
      }
      if (url.includes('/api/case-documents')) return Promise.resolve([{ id: 'doc-1', original_filename: 'rg.pdf' }]);
      if (url.includes('/api/document-checklists')) {
        return Promise.resolve([{ id: 'item-1', title: 'RG', case_id: 'case-1' }]);
      }
      return Promise.resolve([]);
    });

    render(<CaseDocumentsPanel caseItem={caseItem} onClose={jest.fn()} />);
    await waitFor(() => screen.getByText('rg.pdf'));

    fireEvent.click(screen.getByText('Vincular'));

    // Seletor mostra item do caso + opcao "Sem vinculo"
    const select = screen.getByRole('combobox');
    expect(select.querySelectorAll('option').length).toBe(2);
    fireEvent.change(select, { target: { value: 'item-1' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => {
      const call = mockApiJson.mock.calls.find(c => c[0] === '/api/case-documents?id=doc-1');
      expect(call).toBeTruthy();
      expect(call[1].method).toBe('PATCH');
      expect(JSON.parse(call[1].body)).toEqual({ checklist_item_id: 'item-1' });
    });
  });
});

// ---------------------------------------------------------------------------
// 3. DocumentRequestModal
// ---------------------------------------------------------------------------
describe('DocumentRequestModal', () => {
  const DocumentRequestModal = require('../components/DocumentRequestModal').default;

  test('carrega checklist, cria rascunho via POST e envia via POST', async () => {
    mockApiJson.mockImplementation((url, opts) => {
      if (url.includes('action=send')) return Promise.resolve({ id: 'req-1', status: 'sent' });
      if (url === '/api/document-checklist-requests') return Promise.resolve({ id: 'req-1', message: 'msg' });
      if (url.includes('/api/document-checklists')) {
        return Promise.resolve([{ id: 'item-1', title: 'RG', status: 'pendente', is_sensitive: false }]);
      }
      return Promise.resolve([]);
    });

    render(<DocumentRequestModal caseItem={caseItem} onClose={jest.fn()} />);
    await waitFor(() => screen.getByText('RG'));

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Gerar rascunho'));

    await waitFor(() => {
      const call = mockApiJson.mock.calls.find(c => c[0] === '/api/document-checklist-requests');
      expect(call[1].method).toBe('POST');
      const body = JSON.parse(call[1].body);
      expect(body.case_id).toBe('case-1');
      expect(body.items).toEqual(['item-1']);
    });

    await waitFor(() => screen.getByText('Confirmar e enviar'));
    fireEvent.click(screen.getByText('Confirmar e enviar'));

    await waitFor(() => {
      const call = mockApiJson.mock.calls.find(c => c[0].includes('action=send'));
      expect(call[1].method).toBe('POST');
      expect(JSON.parse(call[1].body).id).toBe('req-1');
    });
  });
});

// ---------------------------------------------------------------------------
// 4. GeneratedDocumentsPanel
// ---------------------------------------------------------------------------
describe('GeneratedDocumentsPanel', () => {
  const GeneratedDocumentsPanel = require('../components/GeneratedDocumentsPanel').default;

  test('lista documentos e atualiza status via PATCH', async () => {
    mockApiJson.mockImplementation((url) => {
      if (url.includes('/api/generated-documents?id=')) {
        return Promise.resolve({ id: 'doc-1', status: 'review', title: 'Doc', generated_at: '2026-01-01' });
      }
      if (url.includes('/api/generated-documents')) {
        return Promise.resolve([{ id: 'doc-1', status: 'draft', title: 'Doc', generated_at: '2026-01-01' }]);
      }
      if (url === '/api/templates') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(<GeneratedDocumentsPanel caseId="case-1" conversationId="conv-1" userRole="admin" onClose={jest.fn()} />);
    await waitFor(() => screen.getByText('Doc'));

    fireEvent.click(screen.getByText('Enviar para Revisão'));

    await waitFor(() => {
      const call = mockApiJson.mock.calls.find(c => c[0] === '/api/generated-documents?id=doc-1');
      expect(call[1].method).toBe('PATCH');
      expect(JSON.parse(call[1].body)).toEqual({ status: 'review' });
    });
  });
});

// ---------------------------------------------------------------------------
// 5. SignatureSettings
// ---------------------------------------------------------------------------
describe('SignatureSettings', () => {
  const SignatureSettings = require('../components/SignatureSettings').default;

  test('salvar usa PATCH e testar usa POST', async () => {
    mockApiJson.mockImplementation((url, opts) => {
      if (opts?.method === 'PATCH') return Promise.resolve({ message: 'ok' });
      if (opts?.method === 'POST') return Promise.resolve({ status: 'success' });
      return Promise.resolve({ integrations: [{ id: 'cfg-1', platform: 'zapsign', is_active: true }] });
    });

    render(<SignatureSettings />);
    await waitFor(() => screen.getByText('zapsign'));

    // Salvar -> PATCH
    fireEvent.click(screen.getByText('+ Adicionar Integração'));
    fireEvent.change(screen.getByPlaceholderText('Cole sua API Key aqui'), { target: { value: 'key-123' } });
    fireEvent.click(screen.getByText('Salvar Configuração'));

    await waitFor(() => {
      const call = mockApiJson.mock.calls.find(c => c[1]?.method === 'PATCH');
      expect(call).toBeTruthy();
      expect(JSON.parse(call[1].body).api_key).toBe('key-123');
    });

    // Testar -> POST
    fireEvent.click(screen.getByText('🔗 Testar Conexão'));
    await waitFor(() => {
      const call = mockApiJson.mock.calls.find(c => c[1]?.method === 'POST');
      expect(call).toBeTruthy();
      expect(JSON.parse(call[1].body).platform).toBe('zapsign');
    });
  });
});

// ---------------------------------------------------------------------------
// 6. GET /api/signatures/status - lista vazia retorna 200
// ---------------------------------------------------------------------------
describe('GET /api/signatures/status', () => {
  const handler = require('../pages/api/signatures/status').default;

  test('retorna 200 com signatures: [] quando nao ha assinaturas', async () => {
    mockAnonFrom.mockImplementation(() => chain({ data: [], error: null }));

    const req = { method: 'GET', headers: { authorization: 'Bearer t' }, query: { case_id: '11111111-1111-1111-1111-111111111111' } };
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ signatures: [] }));
  });
});

// ---------------------------------------------------------------------------
// 7. POST /api/signatures/send - 403 antes da Zapsign para usuario sem acesso
// ---------------------------------------------------------------------------
describe('POST /api/signatures/send', () => {
  const handler = require('../pages/api/signatures/send').default;
  const validBody = {
    case_id: '11111111-1111-1111-1111-111111111111',
    document_type: 'contrato',
    document_url: 'https://example.com/doc.pdf',
    signers: [{ name: 'A', email: 'a@a.com' }],
  };

  test('usuario sem acesso recebe 403 e Zapsign nao eh chamada', async () => {
    mockUser = { id: 'user-2', role: 'advogado', auth_user_id: 'auth-2' };
    mockAdminFrom.mockImplementation((table) => {
      if (table === 'cases') return chain({ data: { id: validBody.case_id, conversation_id: 'conv-9', assigned_user_id: 'other' }, error: null });
      if (table === 'conversations') return chain({ data: { assigned_user_id: 'other' }, error: null });
      return chain({ data: null, error: null });
    });

    const req = { method: 'POST', headers: { authorization: 'Bearer t' }, body: validBody };
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('admin autorizado segue fluxo mockado ate a Zapsign', async () => {
    process.env.ZAPSIGN_API_KEY = 'test-key';
    mockUser = { id: 'admin-1', role: 'admin', auth_user_id: 'auth-admin' };
    mockAdminFrom.mockImplementation((table) => {
      if (table === 'cases') return chain({ data: { id: validBody.case_id, conversation_id: 'conv-9', assigned_user_id: null }, error: null });
      if (table === 'document_signatures') return chain({ data: { id: 'sig-1', status: 'pending', signers: [] }, error: null });
      return chain({ data: null, error: null });
    });

    global.fetch
      .mockResolvedValueOnce({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }) // download doc
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ uuid: 'zap-1' }) });        // zapsign

    const req = { method: 'POST', headers: { authorization: 'Bearer t' }, body: validBody };
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    delete process.env.ZAPSIGN_API_KEY;
  });
});

// ---------------------------------------------------------------------------
// 8. PATCH /api/case-documents - item de outro caso rejeitado
// ---------------------------------------------------------------------------
describe('PATCH /api/case-documents', () => {
  test('checklist_item de outro caso retorna 400', async () => {
    jest.resetModules();
    const { createClient } = require('@supabase/supabase-js');
    const client = {
      from: jest.fn((table) => {
        if (table === 'case_documents') return chain({ data: { case_id: 'case-A', is_sensitive: false }, error: null });
        if (table === 'case_document_checklists') return chain({ data: { case_id: 'case-B' }, error: null });
        return chain({ data: null, error: null });
      }),
    };
    createClient.mockReturnValue(client);
    const handler = require('../pages/api/case-documents').default;
    const req = { method: 'PATCH', query: { id: 'doc-1' }, body: { checklist_item_id: 'item-outro' }, headers: {} };
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---------------------------------------------------------------------------
// 9. Webhook - document.signed sem data.signers nao gera 500
// ---------------------------------------------------------------------------
describe('POST /api/signatures/webhook', () => {
  const handler = require('../pages/api/signatures/webhook').default;

  test('evento sem signatarios responde 200', async () => {
    mockAnonFrom.mockImplementation((table) => {
      if (table === 'signature_webhook_logs') return chain({ data: [], error: null });
      if (table === 'document_signatures') return chain({ data: { id: 'sig-1', case_id: 'case-1', signers: null }, error: null });
      if (table === 'cases') return chain({ data: { conversation_id: 'conv-1' }, error: null });
      return chain({ data: null, error: null });
    });

    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { event: 'document.signed', data: { uuid: 'zap-1' } }, // sem signers
    };
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
