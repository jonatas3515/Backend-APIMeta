/**
 * Testes do NotificationPanel - Layout e Portal
 * Cobre: portal, posicionamento, z-index, responsividade, cleanup
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

describe('NotificationPanel - Layout e Portal', () => {
  let mockOnClose;
  let mockTriggerRef;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnClose = jest.fn();

    // Mock do botão trigger com getBoundingClientRect e contains
    const mockTriggerElement = document.createElement('button');
    mockTriggerElement.getBoundingClientRect = jest.fn(() => ({
      top: 50,
      right: 1200,
      bottom: 80,
      left: 1150,
      width: 50,
      height: 30,
    }));
    
    mockTriggerRef = {
      current: mockTriggerElement,
    };

    // Mock window dimensions
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    });

    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 1080,
    });

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [] }),
    });
  });

  test('quando fechado, não deixa painel visível no DOM', () => {
    render(
      <NotificationPanel
        isOpen={false}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    // Painel não deve estar no DOM
    expect(screen.queryByText(/Notificações/)).not.toBeInTheDocument();
  });

  test('quando aberto no desktop, o painel é renderizado via portal diretamente em document.body', async () => {
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
      expect(panelElement).toBeInTheDocument();
      expect(panelElement.parentElement).toBe(document.body);
    });
  });

  test('possui position: fixed', async () => {
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
    });
  });

  test('possui z-index alto (z-[1000])', async () => {
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
      const panel = screen.getByText(/Notificações/).closest('div[class*="z-"]');
      expect(panel).toHaveClass('z-[1000]');
    });
  });

  test('calcula posição abaixo do botão do sino usando getBoundingClientRect', async () => {
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
      expect(mockTriggerRef.current.getBoundingClientRect).toHaveBeenCalled();
    });
  });

  test('respeita largura máxima responsiva em viewport normal', async () => {
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
      const width = parseInt(panel.style.width);
      expect(width).toBeLessThanOrEqual(400);
    });
  });

  test('respeita largura máxima em viewport estreito', async () => {
    // Simular viewport estreito
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 500,
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
      const width = parseInt(panel.style.width);
      // Deve ser viewport - padding (500 - 16 = 484)
      expect(width).toBeLessThanOrEqual(500);
    });
  });

  test('nunca permite left menor que o padding mínimo', async () => {
    // Simular trigger muito à esquerda
    mockTriggerRef.current.getBoundingClientRect = jest.fn(() => ({
      top: 50,
      right: 50,
      bottom: 80,
      left: 0,
      width: 50,
      height: 30,
    }));

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
      const panel = screen.getByText(/Notificações/).closest('div[style*="left"]');
      const left = parseInt(panel.style.left);
      expect(left).toBeGreaterThanOrEqual(8); // viewportPadding mínimo
    });
  });

  test('recalcula a posição em resize', async () => {
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
      expect(mockTriggerRef.current.getBoundingClientRect).toHaveBeenCalled();
    });

    const initialCalls = mockTriggerRef.current.getBoundingClientRect.mock.calls.length;

    // Simular resize
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    await waitFor(() => {
      expect(mockTriggerRef.current.getBoundingClientRect.mock.calls.length).toBeGreaterThan(
        initialCalls
      );
    });
  });

  test('recalcula a posição em scroll (capture mode)', async () => {
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
      expect(mockTriggerRef.current.getBoundingClientRect).toHaveBeenCalled();
    });

    const initialCalls = mockTriggerRef.current.getBoundingClientRect.mock.calls.length;

    // Simular scroll
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    await waitFor(() => {
      expect(mockTriggerRef.current.getBoundingClientRect.mock.calls.length).toBeGreaterThan(
        initialCalls
      );
    });
  });

  test('remove listeners de resize e scroll ao fechar/desmontar', async () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = render(
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

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true);

    removeEventListenerSpy.mockRestore();
  });

  test('cabeçalho mostra "Notificações" integralmente', async () => {
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
      const header = screen.getByText(/🔔 Notificações/);
      expect(header).toBeInTheDocument();
      expect(header).toBeVisible();
    });
  });

  test('renderiza as abas Críticas, Hoje, Próximas e Todas', async () => {
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
      expect(screen.getByText(/Críticas/)).toBeInTheDocument();
      expect(screen.getByText(/Hoje/)).toBeInTheDocument();
      expect(screen.getByText(/Próximas/)).toBeInTheDocument();
      expect(screen.getByText(/Todas/)).toBeInTheDocument();
    });
  });

  test('painel fecha com tecla Escape', async () => {
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

    // Pressionar Escape
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('painel fecha ao clicar fora, mas NÃO fecha quando clicar dentro dele', async () => {
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

    // Clicar dentro do painel
    const panel = screen.getByText(/Notificações/).closest('div');
    fireEvent.mouseDown(panel);

    expect(mockOnClose).not.toHaveBeenCalled();

    // Clicar fora do painel
    fireEvent.mouseDown(document.body);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('painel NÃO fecha ao clicar no botão do sino imediatamente após a abertura', async () => {
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

    // Clicar no trigger (sino)
    fireEvent.mouseDown(mockTriggerRef.current);

    expect(mockOnClose).not.toHaveBeenCalled();
  });
});
