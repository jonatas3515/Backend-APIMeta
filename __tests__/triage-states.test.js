/**
 * Testes de estados vazios, parciais e de erro da Central de Triagem.
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

function mockFetch(scenario) {
  return jest.fn(async (url) => {
    if (url.includes('/api/collaboration?action=users')) {
      return { ok: true, json: async () => ({ users: [] }) };
    }
    if (url.includes('/api/triage?action=stats')) {
      return { ok: true, json: async () => ({ total: 1, by_status: { novo: 1 }, by_priority: { media: 1 }, my_pendencies: 0 }) };
    }
    if (url.includes('/api/triage?action=list')) {
      if (scenario === 'empty') {
        return { ok: true, json: async () => ({ movements: [], total: 0, totalPages: 1 }) };
      }
      if (scenario === 'error') {
        return { ok: false, status: 500, json: async () => ({ error: 'Erro interno sintético' }) };
      }
      if (scenario === 'partial-list-fails') {
        // Primeira página resolve; simulação de load more abaixo
        return { ok: true, json: async () => ({ movements: MOCK_MOVEMENTS, total: 1, totalPages: 1 }) };
      }
      if (scenario === 'two-pages') {
        const page = url.includes('page=2') ? 2 : 1;
        if (page === 1) {
          return { ok: true, json: async () => ({ movements: MOCK_MOVEMENTS, total: 2, totalPages: 2 }) };
        }
        return { ok: false, status: 500, json: async () => ({ error: 'Falha ao carregar mais' }) };
      }
      return { ok: true, json: async () => ({ movements: MOCK_MOVEMENTS, total: 1, totalPages: 1 }) };
    }
    return { ok: true, json: async () => ({}) };
  });
}

describe('ProcessTriagePanel - estados', () => {
  test('estado sem itens mostra mensagem segura', async () => {
    global.fetch = mockFetch('empty');
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await waitFor(() => {
      expect(screen.getByTestId('triage-empty')).toBeInTheDocument();
    });
    expect(screen.getByText('Não há movimentações disponíveis para sua revisão.')).toBeInTheDocument();
  });

  test('filtro sem resultado mostra mensagem e botão de limpar', async () => {
    global.fetch = mockFetch('ok');
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await waitFor(() => {
      expect(screen.getAllByTestId('triage-card').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByTestId('triage-search'), { target: { value: 'termo-que-nao-existe' } });

    await waitFor(() => {
      expect(screen.getByTestId('triage-empty')).toBeInTheDocument();
    });
    expect(screen.getByText('Nenhuma movimentação corresponde aos filtros aplicados')).toBeInTheDocument();
    expect(screen.getByTestId('clear-empty-filters')).toBeInTheDocument();
  });

  test('erro inicial mostra mensagem segura e botão retry', async () => {
    global.fetch = mockFetch('error');
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await waitFor(() => {
      expect(screen.getByTestId('triage-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Não foi possível atualizar a triagem. Tente novamente.')).toBeInTheDocument();
    expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
  });

  test('erro ao carregar mais preserva itens existentes', async () => {
    global.fetch = mockFetch('two-pages');
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await waitFor(() => {
      expect(screen.getAllByTestId('triage-card').length).toBe(1);
    });

    fireEvent.click(screen.getByTestId('load-more'));

    await waitFor(() => {
      expect(screen.getByTestId('triage-partial-error')).toBeInTheDocument();
    });

    expect(screen.getAllByTestId('triage-card').length).toBe(1);
    expect(screen.getByText('Não foi possível atualizar a triagem. Tente novamente.')).toBeInTheDocument();
  });

  test('deep link inválido mostra aviso seguro', async () => {
    global.fetch = mockFetch('ok');
    render(
      <ProcessTriagePanel
        profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }}
        movementId="movimentacao-nao-existe"
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId('triage-message')).toBeInTheDocument();
    });
    expect(screen.getByText(/não encontrada ou não disponível/i)).toBeInTheDocument();
  });

  test('mensagens de estado não expõem PII ou dados do processo', async () => {
    global.fetch = mockFetch('error');
    const sensitiveText = 'CNJ-0000000-00.0000.0.00.0000';

    global.fetch = jest.fn(async (url) => {
      if (url.includes('/api/collaboration?action=users')) {
        return { ok: true, json: async () => ({ users: [] }) };
      }
      if (url.includes('/api/triage?action=stats')) {
        return { ok: true, json: async () => ({ total: 0 }) };
      }
      if (url.includes('/api/triage?action=list')) {
        return Promise.reject(new Error(`Falha: ${sensitiveText}`));
      }
      return { ok: true, json: async () => ({}) };
    });

    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);

    await waitFor(() => {
      expect(screen.getByTestId('triage-error')).toBeInTheDocument();
    });

    expect(screen.queryByText(sensitiveText)).not.toBeInTheDocument();
  });
});
