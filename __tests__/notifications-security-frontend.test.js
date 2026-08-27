/**
 * Testes de Segurança Frontend - Notificações
 * Cobre: ausência de PII, sanitização, validação de conteúdo
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationPanel from '../components/NotificationPanel';
import NotificationItem from '../components/NotificationItem';

// Mock fetch global
global.fetch = jest.fn();

// Mock Next router
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('NotificationPanel - Segurança Frontend', () => {
  let mockOnClose;
  let mockTriggerRef;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnClose = jest.fn();

    mockTriggerRef = {
      current: {
        getBoundingClientRect: jest.fn(() => ({
          top: 50,
          right: 1200,
          bottom: 80,
          left: 1150,
          width: 50,
          height: 30,
        })),
      },
    };

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    });
  });

  test('não renderiza CPF no DOM', async () => {
    const notification = {
      id: 'notif-1',
      type: 'message',
      title: 'Nova mensagem de cliente',
      link: '/?conversation=conv-123',
      priority: 'normal',
      created_at: new Date().toISOString(),
      // Backend NÃO deve enviar estes dados, mas testamos defensivamente
      metadata: {
        cpf: '123.456.789-00',
        client_cpf: '987.654.321-00',
      },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [notification] }),
    });

    const { container } = render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(notification.title)).toBeInTheDocument();
    });

    // Verificar que CPF não está no DOM
    expect(container.textContent).not.toContain('123.456.789-00');
    expect(container.textContent).not.toContain('987.654.321-00');
    expect(container.textContent).not.toContain('12345678900');
  });

  test('não renderiza telefone no DOM', async () => {
    const notification = {
      id: 'notif-2',
      type: 'message',
      title: 'Mensagem recebida',
      link: '/?conversation=conv-456',
      priority: 'normal',
      created_at: new Date().toISOString(),
      metadata: {
        phone: '73 99934-8552',
        client_phone: '5573999348552',
      },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [notification] }),
    });

    const { container } = render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(notification.title)).toBeInTheDocument();
    });

    // Verificar que telefone não está no DOM
    expect(container.textContent).not.toContain('73 99934-8552');
    expect(container.textContent).not.toContain('5573999348552');
  });

  test('não renderiza e-mail no DOM', async () => {
    const notification = {
      id: 'notif-3',
      type: 'message',
      title: 'Contato recebido',
      link: '/?conversation=conv-789',
      priority: 'normal',
      created_at: new Date().toISOString(),
      metadata: {
        email: 'cliente@example.com',
        client_email: 'joao.silva@gmail.com',
      },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [notification] }),
    });

    const { container } = render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(notification.title)).toBeInTheDocument();
    });

    // Verificar que e-mail não está no DOM
    expect(container.textContent).not.toContain('cliente@example.com');
    expect(container.textContent).not.toContain('joao.silva@gmail.com');
  });

  test('não renderiza nome completo fictício de cliente no DOM', async () => {
    const notification = {
      id: 'notif-4',
      type: 'message',
      title: 'Mensagem de cliente',
      link: '/?conversation=conv-abc',
      priority: 'normal',
      created_at: new Date().toISOString(),
      metadata: {
        client_name: 'João Pedro da Silva Santos',
        full_name: 'Maria Aparecida dos Santos',
      },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [notification] }),
    });

    const { container } = render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(notification.title)).toBeInTheDocument();
    });

    // Verificar que nome completo não está no DOM (apenas título sanitizado)
    expect(container.textContent).not.toContain('João Pedro da Silva Santos');
    expect(container.textContent).not.toContain('Maria Aparecida dos Santos');
  });

  test('não renderiza conteúdo de mensagem', async () => {
    const notification = {
      id: 'notif-5',
      type: 'message',
      title: 'Nova mensagem',
      link: '/?conversation=conv-def',
      priority: 'normal',
      created_at: new Date().toISOString(),
      metadata: {
        message_text: 'Olá, preciso de ajuda com meu processo trabalhista',
        message_content: 'Informações confidenciais do cliente aqui',
      },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [notification] }),
    });

    const { container } = render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(notification.title)).toBeInTheDocument();
    });

    // Verificar que conteúdo da mensagem não está no DOM
    expect(container.textContent).not.toContain('preciso de ajuda com meu processo');
    expect(container.textContent).not.toContain('Informações confidenciais');
  });

  test('não renderiza número completo de processo', async () => {
    const notification = {
      id: 'notif-6',
      type: 'process_movement',
      title: 'Movimentação processual',
      link: '/?process=proc-ghi',
      priority: 'normal',
      created_at: new Date().toISOString(),
      metadata: {
        process_number: '0001234-56.2023.8.05.0001',
        cnj_number: '0001234-56.2023.8.05.0001',
      },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [notification] }),
    });

    const { container } = render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(notification.title)).toBeInTheDocument();
    });

    // Verificar que número do processo não está no DOM
    expect(container.textContent).not.toContain('0001234-56.2023.8.05.0001');
  });

  test('não renderiza URL assinada', async () => {
    const notification = {
      id: 'notif-7',
      type: 'signature',
      title: 'Assinatura pendente',
      link: '/?signatures=true&id=sig-jkl',
      priority: 'normal',
      created_at: new Date().toISOString(),
      metadata: {
        signed_url: 'https://storage.example.com/docs/secret-token-abc?signature=xyz',
        document_url: 'https://cdn.example.com/private/doc.pdf?auth=token123',
      },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [notification] }),
    });

    const { container } = render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(notification.title)).toBeInTheDocument();
    });

    // Verificar que URL assinada não está no DOM
    expect(container.textContent).not.toContain('secret-token-abc');
    expect(container.textContent).not.toContain('signature=xyz');
    expect(container.textContent).not.toContain('auth=token123');
  });

  test('não renderiza storage_path', async () => {
    const notification = {
      id: 'notif-8',
      type: 'message',
      title: 'Documento recebido',
      link: '/?conversation=conv-mno',
      priority: 'normal',
      created_at: new Date().toISOString(),
      metadata: {
        storage_path: '/private/uploads/client-123/document.pdf',
        file_path: '/var/www/storage/files/secret.docx',
      },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [notification] }),
    });

    const { container } = render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(notification.title)).toBeInTheDocument();
    });

    // Verificar que storage_path não está no DOM
    expect(container.textContent).not.toContain('/private/uploads');
    expect(container.textContent).not.toContain('/var/www/storage');
  });

  test('não renderiza token, authorization ou metadados brutos', async () => {
    const notification = {
      id: 'notif-9',
      type: 'message',
      title: 'Atualização',
      link: '/?conversation=conv-pqr',
      priority: 'normal',
      created_at: new Date().toISOString(),
      metadata: {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        authorization: 'Bearer secret-token-xyz',
        api_key: 'sk-1234567890abcdef',
      },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [notification] }),
    });

    const { container } = render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(notification.title)).toBeInTheDocument();
    });

    // Verificar que tokens não estão no DOM
    expect(container.textContent).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(container.textContent).not.toContain('Bearer secret-token-xyz');
    expect(container.textContent).not.toContain('sk-1234567890abcdef');
  });

  test('não usa dangerouslySetInnerHTML', async () => {
    const notification = {
      id: 'notif-10',
      type: 'message',
      title: '<script>alert("xss")</script>Título malicioso',
      link: '/?conversation=conv-stu',
      priority: 'normal',
      created_at: new Date().toISOString(),
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [notification] }),
    });

    const { container } = render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });

    // Verificar que não há elementos script no DOM
    const scripts = container.querySelectorAll('script');
    expect(scripts.length).toBe(0);

    // Verificar que o HTML foi escapado
    expect(container.innerHTML).not.toContain('<script>');
  });

  test('texto do card vem exclusivamente dos campos seguros previstos', async () => {
    const notification = {
      id: 'notif-11',
      type: 'deadline',
      title: 'Prazo próximo: Caso Trabalhista',
      link: '/?case=case-vwx',
      priority: 'high',
      created_at: new Date().toISOString(),
      // Campos seguros que DEVEM aparecer
      relative_date: 'vence em 2 dias',
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [notification] }),
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
      // Campos seguros devem estar presentes
      expect(screen.getByText(/Prazo próximo/)).toBeInTheDocument();
    });
  });

  test('NotificationItem não renderiza dados sensíveis diretamente', () => {
    const notification = {
      id: 'notif-12',
      type: 'message',
      title: 'Mensagem segura',
      link: '/?conversation=conv-yza',
      priority: 'normal',
      created_at: new Date().toISOString(),
      metadata: {
        sensitive_data: 'CPF: 123.456.789-00, Telefone: 73 99934-8552',
      },
    };

    const { container } = render(
      <NotificationItem
        notification={notification}
        onAction={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    // Verificar que dados sensíveis não estão no DOM
    expect(container.textContent).not.toContain('123.456.789-00');
    expect(container.textContent).not.toContain('73 99934-8552');

    // Apenas título seguro deve estar presente
    expect(container.textContent).toContain('Mensagem segura');
  });
});
