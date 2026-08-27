/**
 * Testes do NotificationPanel - Comportamento Mobile
 * Cobre: fullscreen, backdrop, responsividade
 */

import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationPanel from '../components/NotificationPanel';

// Mock fetch global
global.fetch = jest.fn();

// Mock Next router
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('NotificationPanel - Mobile', () => {
  let mockOnClose;
  let mockTriggerRef;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnClose = jest.fn();

    mockTriggerRef = {
      current: {
        getBoundingClientRect: jest.fn(() => ({
          top: 50,
          right: 400,
          bottom: 80,
          left: 350,
          width: 50,
          height: 30,
        })),
      },
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [] }),
    });
  });

  test('painel aberto usa Portal em mobile', async () => {
    // Simular mobile
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      const panel = screen.getByText(/Notificações/);
      expect(panel).toBeInTheDocument();

      // Verificar que está em document.body
      const panelElement = panel.closest('[class*="fixed"]');
      expect(panelElement.parentElement).toBe(document.body);
    });
  });

  test('painel possui fixed inset-0 em mobile', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      const panel = screen.getByText(/Notificações/).closest('div[class*="fixed"]');
      expect(panel).toHaveClass('fixed');
      expect(panel).toHaveClass('inset-0');
    });
  });

  test('possui width: 100vw em mobile', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      const panel = screen.getByText(/Notificações/).closest('div[style*="width"]');
      expect(panel.style.width).toBe('100vw');
    });
  });

  test('possui height: 100dvh em mobile (via inset-0 ou estilo)', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      const panel = screen.getByText(/Notificações/).closest('div[class*="fixed inset-0"]');
      expect(panel).toBeInTheDocument();
      // Verificar que usa inset-0 (que equivale a top:0, right:0, bottom:0, left:0, cobrindo 100% da altura)
      expect(panel).toHaveClass('inset-0');
    });
  });

  test('não usa largura máxima de 400px em mobile', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      const panel = screen.getByText(/Notificações/).closest('div[class*="fixed inset-0"]');
      expect(panel).toBeInTheDocument();
      // Verificar que o estilo inline contém maxWidth: none
      const styleAttr = panel.getAttribute('style');
      expect(styleAttr).toContain('max-width');
      expect(styleAttr).toContain('none');
    });
  });

  test('backdrop é exibido em mobile', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      const backdrop = screen.getByTestId('backdrop');
      expect(backdrop).toBeInTheDocument();
      expect(backdrop).toHaveClass('fixed');
      expect(backdrop).toHaveClass('inset-0');
    });
  });

  test('botão "Fechar" é visível e fecha o painel em mobile', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      const closeButton = screen.getByText('✕');
      expect(closeButton).toBeInTheDocument();
      expect(closeButton).toBeVisible();
    });

    const closeButton = screen.getByText('✕');
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('clique no backdrop fecha o painel em mobile', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      const backdrop = screen.getByTestId('backdrop');
      expect(backdrop).toBeInTheDocument();
    });

    const backdrop = screen.getByTestId('backdrop');
    fireEvent.click(backdrop);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('clique no conteúdo não fecha o painel em mobile', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Notificações/)).toBeInTheDocument();
    });

    const panel = screen.getByText(/Notificações/).closest('div');
    fireEvent.click(panel);

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  test('Escape fecha o painel também em mobile', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Notificações/)).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('trocar o viewport de desktop para mobile enquanto o painel está aberto atualiza o modo corretamente', async () => {
    // Iniciar em desktop
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    });

    const { rerender } = render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Notificações/)).toBeInTheDocument();
    });

    // Não deve ter backdrop em desktop
    expect(screen.queryByTestId('backdrop')).not.toBeInTheDocument();

    // Mudar para mobile
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    await waitFor(() => {
      // Deve ter backdrop em mobile
      expect(screen.getByTestId('backdrop')).toBeInTheDocument();
    });
  });

  test('trocar de mobile para desktop restaura posicionamento ancorado', async () => {
    // Iniciar em mobile
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('backdrop')).toBeInTheDocument();
    });

    // Mudar para desktop
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    });

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    await waitFor(() => {
      // Não deve ter backdrop em desktop
      expect(screen.queryByTestId('backdrop')).not.toBeInTheDocument();

      // Deve ter posicionamento calculado
      const panel = screen.getByText(/Notificações/).closest('div[style*="left"]');
      expect(panel.style.left).toBeTruthy();
    });
  });
});
