import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminMetrics from '../../pages/admin/metrics';
import * as useAuth from '../../lib/useAuth';
import * as apiClient from '../../lib/apiClient';

jest.mock('../../lib/useAuth', () => ({
  useAuth: jest.fn()
}));

jest.mock('../../lib/apiClient', () => ({
  apiJson: jest.fn(),
  apiCall: jest.fn()
}));

describe('Admin Metrics - página', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.useAuth.mockReturnValue({
      profile: { role: 'admin', id: 'admin-1' },
      loading: false
    });
    apiClient.apiJson.mockResolvedValue({
      collectedAt: '2026-09-12T15:00:00.000Z',
      source: 'backend-api-meta',
      metrics: {
        'cases:link': 5,
        'cases:unlink': 2
      }
    });
    apiClient.apiCall.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['csv,content'], { type: 'text/csv' })
    });
    window.URL.createObjectURL = jest.fn(() => 'blob:test');
    window.URL.revokeObjectURL = jest.fn();
  });

  test('renderiza tabela de metricas para admin', async () => {
    render(<AdminMetrics />);
    await waitFor(() => {
      expect(screen.getByText('cases:link')).toBeInTheDocument();
      expect(screen.getByText('cases:unlink')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeInTheDocument();
  });

  test('admin pode exportar CSV', async () => {
    render(<AdminMetrics />);
    await waitFor(() => expect(screen.getByText('cases:link')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => {
      expect(apiClient.apiCall).toHaveBeenCalledWith('/api/metrics?format=csv');
    });
  });

  test('nao-admin ve tela de acesso negado', () => {
    useAuth.useAuth.mockReturnValue({
      profile: { role: 'advogado', id: 'user-2' },
      loading: false
    });
    render(<AdminMetrics />);
    expect(screen.getByText('Acesso negado')).toBeInTheDocument();
  });
});
