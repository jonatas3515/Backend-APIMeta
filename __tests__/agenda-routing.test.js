/**
 * Testes de roteamento a partir da Agenda.
 * Verifica que cada tipo de item abre o módulo correto sem expor PII.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AgendaPanel from '../components/AgendaPanel';
import { useRouter } from 'next/router';

jest.mock('next/router', () => ({
  useRouter: jest.fn()
}));

jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({ Authorization: 'Bearer test' }))
}));

jest.mock('../hooks/useAreaFilter', () => ({
  __esModule: true,
  default: () => ({ selectedArea: '', setSelectedArea: jest.fn() })
}));

jest.mock('../components/ExportButtons', () => ({
  __esModule: true,
  default: () => null
}));

jest.mock('../components/CaseCalendarSync', () => ({
  __esModule: true,
  default: () => null
}));

global.fetch = jest.fn();

describe('AgendaPanel - roteamento', () => {
  let mockPush;

  const agendaData = {
    by_day: {
      '2026-08-29': [
        { id: 'deadline-synthetic-001', item_type: 'case_deadline', case_id: 'case-synthetic-001', title: 'Prazo de recurso', event_type: 'prazo_judicial', priority: 'alta' },
        { id: 'reminder-synthetic-001', item_type: 'reminder', conversation_id: 'conv-synthetic-001', title: 'Lembrete de chat', event_type: 'lembrete_cliente', priority: 'media' },
        { id: 'event-synthetic-001', item_type: 'case_event', event_id: 'event-synthetic-001', title: 'Audiência de conciliação', event_type: 'audiencia', priority: 'alta' },
        { id: 'reminder-synthetic-002', item_type: 'reminder', case_id: 'case-synthetic-001', title: 'Lembrete de caso', event_type: 'prazo_interno', priority: 'baixa' },
        { id: 'reminder-synthetic-003', item_type: 'reminder', title: 'Lembrete sem referência', event_type: 'lembrete_cliente', priority: 'baixa' },
        { id: 'deadline-synthetic-002', item_type: 'case_deadline', case_id: '123.456.789-00', title: 'Prazo com PII no id', event_type: 'prazo_judicial', priority: 'alta' },
      ]
    },
    total_items: 6
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPush = jest.fn();
    useRouter.mockReturnValue({ push: mockPush });
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => agendaData
    });
  });

  const setup = () => render(<AgendaPanel />);

  test('prazo de caso abre aba de Casos com caseId e reminderId', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Prazo de recurso')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Prazo de recurso'));
    expect(mockPush).toHaveBeenCalledWith('/?tab=cases&caseId=case-synthetic-001&reminderId=deadline-synthetic-001');
  });

  test('lembrete de conversa abre Chat com conversationId e reminderId', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Lembrete de chat')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Lembrete de chat'));
    expect(mockPush).toHaveBeenCalledWith('/?tab=chat&conversationId=conv-synthetic-001&reminderId=reminder-synthetic-001');
  });

  test('evento de agenda abre aba de Agenda com eventId e reminderId', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Audiência de conciliação')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Audiência de conciliação'));
    expect(mockPush).toHaveBeenCalledWith('/?tab=agenda&eventId=event-synthetic-001&reminderId=event-synthetic-001');
  });

  test('lembrete vinculado a caso abre Casos com caseId', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Lembrete de caso')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Lembrete de caso'));
    expect(mockPush).toHaveBeenCalledWith('/?tab=cases&caseId=case-synthetic-001&reminderId=reminder-synthetic-002');
  });

  test('item sem referência inequívoca não navega', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Lembrete sem referência')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Lembrete sem referência'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('item com PII no identificador não gera rota', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Prazo com PII no id')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Prazo com PII no id'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('URLs geradas não carregam tokens, storage_path, e-mail, CPF, telefone ou URL externa', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Prazo de recurso')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Prazo de recurso'));
    const url = mockPush.mock.calls[0][0];
    const lower = url.toLowerCase();
    expect(lower).not.toContain('token');
    expect(lower).not.toContain('storage_path');
    expect(lower).not.toContain('signature');
    expect(lower).not.toContain('http:');
    expect(lower).not.toContain('https:');
    expect(lower).not.toContain('//');
    expect(lower).not.toContain('123.456.789-00');
    expect(lower).not.toContain('@');
  });
});
