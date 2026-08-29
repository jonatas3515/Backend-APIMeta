/**
 * Testes - Confirmação de mudança de estágio no FunnelKanban
 * Garante que qualquer alteração exija confirmação explícita
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

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

describe('FunnelKanban - Confirmação de mudança de estágio', () => {
  let user;

  beforeEach(() => {
    user = userEvent.setup();
    jest.clearAllMocks();
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ([]) // nenhum caso ativo
      })
    );
  });

  const conversation = {
    id: 'conv-1',
    client_name: 'Cliente Sintético',
    funnel_stage: 'lead_novo',
    assigned_user_id: 'user-1',
    has_case: false
  };

  test('abre modal de confirmação ao alterar o select', async () => {
    const { container } = render(<FunnelKanban conversations={[conversation]} selectedArea="" onAreaChange={() => {}} />);

    await screen.findByText('Cliente Sintético');
    const select = container.querySelector('[data-testid="funnel-stage-select"]');
    await user.selectOptions(select, 'intake_em_andamento');

    await waitFor(() => {
      expect(screen.getByText(/Confirmar mudança de estágio/i)).toBeInTheDocument();
    });

    expect(screen.getByTestId('confirm-modal-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-modal-cancel')).toBeInTheDocument();
  });

  test('cancelar não dispara PATCH', async () => {
    const { container } = render(<FunnelKanban conversations={[conversation]} selectedArea="" onAreaChange={() => {}} />);

    await screen.findByText('Cliente Sintético');
    const select = container.querySelector('[data-testid="funnel-stage-select"]');
    await user.selectOptions(select, 'intake_em_andamento');

    const cancelButton = await screen.findByTestId('confirm-modal-cancel');
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText(/Confirmar mudança de estágio/i)).not.toBeInTheDocument();
    });

    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/funnel',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  test('confirmar faz exatamente um PATCH para /api/funnel', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          conversation: { ...conversation, funnel_stage: 'intake_em_andamento' }
        })
      })
    );

    const { container } = render(<FunnelKanban conversations={[conversation]} selectedArea="" onAreaChange={() => {}} />);

    await screen.findByText('Cliente Sintético');
    const select = container.querySelector('[data-testid="funnel-stage-select"]');
    await user.selectOptions(select, 'intake_em_andamento');

    const confirmButton = await screen.findByTestId('confirm-modal-confirm');
    await user.click(confirmButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/funnel',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
          body: expect.stringContaining('intake_em_andamento')
        })
      );
    });

    const patchCalls = global.fetch.mock.calls.filter(call => call[1]?.method === 'PATCH');
    expect(patchCalls).toHaveLength(1);
  });

  test('erro no PATCH exibe mensagem segura sem PII', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' })
      })
    );

    const { container } = render(<FunnelKanban conversations={[conversation]} selectedArea="" onAreaChange={() => {}} />);

    await screen.findByText('Cliente Sintético');
    const select = container.querySelector('[data-testid="funnel-stage-select"]');
    await user.selectOptions(select, 'intake_em_andamento');

    const confirmButton = await screen.findByTestId('confirm-modal-confirm');
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByTestId('confirm-modal-error')).toBeInTheDocument();
    });

    const errorEl = screen.getByTestId('confirm-modal-error');
    expect(errorEl.textContent).toContain('Não foi possível');
    expect(errorEl.textContent).not.toContain('Cliente Sintético');
    expect(errorEl.textContent).not.toContain('conv-1');
  });
});
