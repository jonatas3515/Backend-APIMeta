/**
 * Testes de UI do CaseCalendarSync.
 * Foco na clareza entre data interna e último sync manual.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CaseCalendarSync from '../components/CaseCalendarSync';

jest.mock('next/router', () => ({
  useRouter: jest.fn()
}));

jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({ Authorization: 'Bearer test' }))
}));

jest.mock('../lib/safeLogger', () => ({
  safeError: jest.fn()
}));

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args)
  }
}));

describe('CaseCalendarSync - estados de sincronização', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({
      data: {
        integrations: [
          { provider: 'google', is_active: true }
        ]
      }
    });
  });

  const renderComponent = (props = {}) =>
    render(
      <CaseCalendarSync
        eventId="case-001"
        table="cases"
        deadlineDate="2026-09-15"
        title="Prazo de recurso"
        {...props}
      />
    );

  test('nunca sincronizado exibe mensagem adequada', async () => {
    mockGet.mockResolvedValueOnce({
      data: { integrations: [{ provider: 'google', is_active: true }] }
    });
    mockGet.mockResolvedValueOnce({
      data: { synced: false, provider: null, synced_at: null, last_sync_status: null }
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('sync-status')).toHaveTextContent(
        'Ainda não sincronizado com o Google Calendar.'
      );
    });
  });

  test('synced e não alterado não mostra aviso de desatualizado', async () => {
    mockGet.mockResolvedValueOnce({
      data: { integrations: [{ provider: 'google', is_active: true }] }
    });
    mockGet.mockResolvedValueOnce({
      data: {
        synced: true,
        provider: 'google',
        synced_at: '2026-09-10T10:00:00.000Z',
        last_sync_status: 'success'
      }
    });

    renderComponent({ internalUpdatedAt: '2026-09-09T12:00:00.000Z' });

    await waitFor(() => {
      expect(screen.getByTestId('sync-status')).toHaveTextContent(
        'Última sincronização com o Google Calendar'
      );
    });

    expect(screen.queryByTestId('outdated-warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('sync-status')).toHaveTextContent(
      'Alterações feitas no sistema não são enviadas automaticamente ao Google Calendar.'
    );
  });

  test('alterado depois do sync mostra badge de desatualizado', async () => {
    mockGet.mockResolvedValueOnce({
      data: { integrations: [{ provider: 'google', is_active: true }] }
    });
    mockGet.mockResolvedValueOnce({
      data: {
        synced: true,
        provider: 'google',
        synced_at: '2026-09-10T10:00:00.000Z',
        last_sync_status: 'success'
      }
    });

    renderComponent({ internalUpdatedAt: '2026-09-11T12:00:00.000Z' });

    await waitFor(() => {
      expect(screen.getByTestId('outdated-warning')).toHaveTextContent(
        'Google Calendar desatualizado'
      );
    });

    expect(screen.getByTestId('sync-status')).toHaveTextContent(
      'Este item foi alterado no sistema depois da última sincronização com o Google Calendar.'
    );
  });

  test('dados insuficientes não afirma desatualização', async () => {
    mockGet.mockResolvedValueOnce({
      data: { integrations: [{ provider: 'google', is_active: true }] }
    });
    mockGet.mockResolvedValueOnce({
      data: {
        synced: true,
        provider: 'google',
        synced_at: '2026-09-10T10:00:00.000Z',
        last_sync_status: 'success'
      }
    });

    renderComponent({ internalUpdatedAt: null });

    await waitFor(() => {
      expect(screen.getByTestId('sync-status')).toHaveTextContent(
        'Última sincronização com o Google Calendar'
      );
    });

    expect(screen.queryByTestId('outdated-warning')).not.toBeInTheDocument();
  });

  test('clique em sincronizar dispara apenas uma chamada', async () => {
    mockGet.mockResolvedValueOnce({
      data: { integrations: [{ provider: 'google', is_active: true }] }
    });
    mockGet.mockResolvedValueOnce({
      data: { synced: false, provider: null, synced_at: null, last_sync_status: null }
    });
    mockPost.mockResolvedValue({
      data: { success: true, action: 'sync' }
    });

    renderComponent({ internalUpdatedAt: '2026-09-11T12:00:00.000Z' });

    await waitFor(() => {
      expect(screen.getByTestId('sync-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('sync-button'));
    fireEvent.click(screen.getByTestId('sync-button'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId('sync-message')).toHaveTextContent(
      'Sincronizado com o Google Calendar'
    );
  });

  test('erro mantém estado anterior e exibe mensagem genérica', async () => {
    mockGet.mockResolvedValueOnce({
      data: { integrations: [{ provider: 'google', is_active: true }] }
    });
    mockGet.mockResolvedValueOnce({
      data: {
        synced: true,
        provider: 'google',
        synced_at: '2026-09-10T10:00:00.000Z',
        last_sync_status: 'success'
      }
    });
    mockPost.mockRejectedValueOnce(new Error('Google Calendar indisponível'));

    renderComponent({ internalUpdatedAt: '2026-09-11T12:00:00.000Z' });

    await waitFor(() => {
      expect(screen.getByTestId('sync-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('sync-button'));

    await waitFor(() => {
      expect(screen.getByTestId('sync-message')).toHaveTextContent(
        'Não foi possível sincronizar com o Google Calendar. Tente novamente.'
      );
    });

    expect(screen.getByTestId('outdated-warning')).toBeInTheDocument();
  });

  test('DOM não contém IDs ou URLs sensíveis do calendário', async () => {
    mockGet.mockResolvedValueOnce({
      data: { integrations: [{ provider: 'google', is_active: true }] }
    });
    mockGet.mockResolvedValueOnce({
      data: {
        synced: true,
        provider: 'google',
        synced_at: '2026-09-10T10:00:00.000Z',
        last_sync_status: 'success'
      }
    });

    renderComponent({ internalUpdatedAt: '2026-09-11T12:00:00.000Z' });

    await waitFor(() => {
      expect(screen.getByTestId('sync-status')).toBeInTheDocument();
    });

    const container = document.body.textContent;
    expect(container).not.toContain('calendar.google.com');
    expect(container).not.toContain('eventId-');
    expect(container).not.toContain('external_event_id');
    expect(container).not.toContain('html_link');
  });
});
