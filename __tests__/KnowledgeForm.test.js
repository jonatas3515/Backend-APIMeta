import { render, screen, fireEvent } from '@testing-library/react';
import KnowledgeForm from '../components/KnowledgeForm';

describe('KnowledgeForm', () => {
  test('renderiza campos do formulário', () => {
    render(<KnowledgeForm onSubmit={() => {}} />);
    expect(screen.getByLabelText('Título')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    expect(screen.getByLabelText('Conteúdo')).toBeInTheDocument();
    expect(screen.getByLabelText('Resumo')).toBeInTheDocument();
    expect(screen.getByLabelText('Tags')).toBeInTheDocument();
    expect(screen.getByLabelText('Cadastrar documento')).toBeInTheDocument();
  });

  test('chama onSubmit com dados preenchidos', () => {
    const onSubmit = jest.fn();
    render(<KnowledgeForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Tese teste' } });
    fireEvent.change(screen.getByLabelText('Conteúdo'), { target: { value: 'Conteúdo jurídico suficientemente longo.' } });
    fireEvent.click(screen.getByLabelText('Cadastrar documento'));
    expect(onSubmit).toHaveBeenCalled();
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.title).toBe('Tese teste');
  });
});
