import { render, screen, fireEvent } from '@testing-library/react';
import WhatsAppTemplateList from '../components/WhatsAppTemplateList';

describe('WhatsAppTemplateList', () => {
  const templates = [
    { id: 't1', name: 'welcome', category: 'UTILITY', content: 'Olá {{1}}', variables: ['1'], status: 'approved', createdAt: '2026-01-15T10:00:00Z' },
    { id: 't2', name: 'reminder', category: 'MARKETING', content: 'Lembrete {{1}}', variables: ['1'], status: 'draft', createdAt: '2026-01-16T10:00:00Z' }
  ];

  test('renderiza templates com nome e categoria', () => {
    render(<WhatsAppTemplateList templates={templates} onDelete={() => {}} />);
    expect(screen.getByText('welcome')).toBeInTheDocument();
    expect(screen.getByText('Categoria: UTILITY')).toBeInTheDocument();
    expect(screen.getByText('reminder')).toBeInTheDocument();
  });

  test('chama onDelete ao clicar em excluir', () => {
    const onDelete = jest.fn();
    render(<WhatsAppTemplateList templates={templates} onDelete={onDelete} />);
    const buttons = screen.getAllByLabelText(/Excluir template/);
    fireEvent.click(buttons[0]);
    expect(onDelete).toHaveBeenCalledWith('t1');
  });
});
