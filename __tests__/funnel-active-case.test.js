/**
 * Testes - FunnelKanban busca caso ativo pela rota correta
 * Garante uso de /api/cases?conversation_id em vez de /api/cases/active
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock de autenticação
jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({
    Authorization: 'Bearer test-token',
    'Content-Type': 'application/json'
  }))
}));

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }))
    },
    from: jest.fn((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: jest.fn(() => Promise.resolve({ data: { role: 'advogado' }, error: null })) })) }))
        };
      }
      return {
        select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })) })) }))
      };
    })
  }
}));

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn() })
}));

jest.mock('../lib/router', () => ({
  navigateToCase: jest.fn()
}));

jest.mock('../lib/export', () => ({
  exportFunnelPdf: jest.fn(),
  exportFunnelExcel: jest.fn()
}));

jest.mock('../components/CaseCreationModal', () => () => null);
jest.mock('../components/CaseLinkModal', () => () => null);

import FunnelKanban from '../components/FunnelKanban';

describe('FunnelKanban - Caso ativo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [{ id: 'case-1', conversation_id: 'conv-1', status: 'em_analise' }]
      })
    );
  });

  test('chama /api/cases?conversation_id para cada conversa elegível', async () => {
    const conversations = [
      {
        id: 'conv-1',
        client_name: 'Cliente Sintético',
        funnel_stage: 'intake_concluido',
        assigned_user_id: 'user-1',
        has_case: true
      }
    ];

    render(<FunnelKanban conversations={conversations} selectedArea="" onAreaChange={() => {}} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cases?conversation_id=conv-1',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-token' })
        })
      );
    });

    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/cases/active'),
      expect.anything()
    );
  });

  test('não chama endpoint para conversa inacessível', async () => {
    const conversations = [
      {
        id: 'conv-2',
        client_name: 'Cliente Alheio',
        funnel_stage: 'lead_novo',
        assigned_user_id: 'user-outro',
        has_case: false
      }
    ];

    render(<FunnelKanban conversations={conversations} selectedArea="" onAreaChange={() => {}} />);

    // Espera um pouco e confirma que o endpoint não foi chamado
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('conv-2'),
      expect.anything()
    );
  });

  test('exibe botão "Abrir caso vinculado" quando há caso ativo', async () => {
    const conversations = [
      {
        id: 'conv-1',
        client_name: 'Cliente Sintético',
        funnel_stage: 'intake_concluido',
        assigned_user_id: 'user-1',
        has_case: true
      }
    ];

    render(<FunnelKanban conversations={conversations} selectedArea="" onAreaChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/Abrir caso vinculado/i)).toBeInTheDocument();
    });
  });
});
