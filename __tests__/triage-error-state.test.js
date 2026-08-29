/**
 * Testes de tratamento de erro na Central de Triagem.
 * Garante mensagens seguras, retry e preservação de estado.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProcessTriagePanel from '../components/ProcessTriagePanel';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn() })
}));

jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({ Authorization: 'Bearer test' }))
}));

const MOCK_MOVEMENTS = [
  {
    id: 'movement-synthetic-001',
    triage_status: 'novo',
    legal_classification: 'ainda_nao_classificada',
    priority: 'media',
    movement_date: '2026-08-20T10:00:00Z',
    detected_at: '2026-08-21T10:00:00Z',
    case_process: {
      court_name: 'Tribunal Sintético',
      court_code: 'TRT-TEST',
      case: { id: 'case-synthetic-001', title: 'Caso Sintético', legal_area: 'direito_do_trabalho' }
    }
  }
];

function mockFetchResponse(type) {
  return jest.fn(async (url) => {
    if (url.includes('/api/collaboration?action=users')) {
      return { ok: true, json: async () => ({ users: [] }) };
    }
    if (url.includes('/api/triage?action=stats')) {
      return { ok: true, json: async () => ({ total: 0 }) };
    }
    if (url.includes('/api/triage?action=list')) {
      if (type === 'reject') {
        return Promise.reject(new Error('Falha de rede sintética'));
      }
      if (type === 'http-error') {
        return { ok: false, status: 500, json: async () => ({ error: 'Erro interno sintético' }) };
      }
      if (type === 'invalid-json') {
        return { ok: true, json: async () => { throw new Error('JSON inválido'); } };
      }
      return { ok: true, json: async () => ({ movements: MOCK_MOVEMENTS, totalPages: 1 }) };
    }
    if (url.includes('/api/triage?id=')) {
      return { ok: true, json: async () => ({ movement: MOCK_MOVEMENTS[0], history: [] }) };
    }
    return { ok: true, json: async () => ({}) };
  });
}

describe('ProcessTriagePanel - tratamento de erro', () => {
  let consoleError;

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  test('fetch rejeitado exibe mensagem segura de erro com retry', async () => {
    global.fetch = mockFetchResponse('reject');

    render(<ProcessTriagePanel profile={{ id: 'user-1', name: 'Dr. Ana', role: 'advogado' }} />);

    await waitFor(() => {
      expect(screen.getByTestId('triage-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Não foi possível atualizar a triagem. Tente novamente.')).toBeInTheDocument();
    expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
  });

  test('erro HTTP exibe mensagem segura vinda da resposta ou padrão', async () => {
    global.fetch = mockFetchResponse('http-error');

    render(<ProcessTriagePanel profile={{ id: 'user-1', name: 'Dr. Ana', role: 'advogado' }} />);

    await waitFor(() => {
      expect(screen.getByTestId('triage-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Não foi possível atualizar a triagem. Tente novamente.')).toBeInTheDocument();
  });

  test('JSON inválido exibe mensagem de erro e retry', async () => {
    global.fetch = mockFetchResponse('invalid-json');

    render(<ProcessTriagePanel profile={{ id: 'user-1', name: 'Dr. Ana', role: 'advogado' }} />);

    await waitFor(() => {
      expect(screen.getByTestId('triage-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Não foi possível atualizar a triagem. Tente novamente.')).toBeInTheDocument();
  });

  test('retry refaz a chamada à API', async () => {
    global.fetch = mockFetchResponse('reject');

    render(<ProcessTriagePanel profile={{ id: 'user-1', name: 'Dr. Ana', role: 'advogado' }} />);

    await waitFor(() => {
      expect(screen.getByTestId('triage-error')).toBeInTheDocument();
    });

    const callsBefore = global.fetch.mock.calls.length;

    global.fetch = mockFetchResponse('ok');

    fireEvent.click(screen.getByText('Tentar novamente'));

    await waitFor(() => {
      expect(global.fetch.mock.calls.length).toBeGreaterThan(0);
    });
  });

  test('erro não exibe estado vazio ao mesmo tempo', async () => {
    global.fetch = mockFetchResponse('reject');

    render(<ProcessTriagePanel profile={{ id: 'user-1', name: 'Dr. Ana', role: 'advogado' }} />);

    await waitFor(() => {
      expect(screen.getByTestId('triage-error')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('triage-empty')).not.toBeInTheDocument();
  });

  test('deep link de movimentação inválida mostra aviso seguro', async () => {
    global.fetch = mockFetchResponse('ok');

    render(
      <ProcessTriagePanel
        profile={{ id: 'user-1', name: 'Dr. Ana', role: 'advogado' }}
        movementId="movimentacao-nao-existe"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('triage-message')).toBeInTheDocument();
    });

    expect(screen.getByText(/não encontrada ou não disponível/i)).toBeInTheDocument();
  });

  test('nenhum log de erro expõe PII ou payload bruto', async () => {
    global.fetch = mockFetchResponse('reject');
    const sensitivePhone = 'TELEFONE-SINTETICO-5511999999999';
    const err = new Error(`Erro: ${sensitivePhone}`);

    global.fetch = jest.fn(async (url) => {
      if (url.includes('/api/collaboration?action=users')) {
        return { ok: true, json: async () => ({ users: [] }) };
      }
      if (url.includes('/api/triage?action=stats')) {
        return { ok: true, json: async () => ({ total: 0 }) };
      }
      if (url.includes('/api/triage?action=list')) {
        return Promise.reject(err);
      }
      return { ok: true, json: async () => ({}) };
    });

    render(<ProcessTriagePanel profile={{ id: 'user-1', name: 'Dr. Ana', role: 'advogado' }} />);

    await waitFor(() => {
      expect(screen.getByTestId('triage-error')).toBeInTheDocument();
    });

    const logs = consoleError.mock.calls.map(c => c.join(' ')).join(' ');
    expect(logs).not.toContain('5511999999999');
    expect(logs).not.toContain('TELEFONE-SINTETICO-');
    expect(logs).toContain('[TRIAGE]');
  });
});
