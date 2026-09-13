import { render, screen, fireEvent } from '@testing-library/react';
import KnowledgeList from '../components/KnowledgeList';

const mockPush = jest.fn();

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: mockPush
  })
}));

describe('KnowledgeList', () => {
  const docs = [
    { id: 'd-001', title: 'Tese danos morais', type: 'tese', tags: ['danos morais'] },
    { id: 'd-002', title: 'Modelo de petição', type: 'modelo', tags: [] }
  ];

  test('renderiza lista de documentos', () => {
    render(<KnowledgeList documents={docs} query="" onQueryChange={() => {}} onSearch={() => {}} onNew={() => {}} onDelete={() => {}} canDelete />);
    expect(screen.getByText('Tese danos morais')).toBeInTheDocument();
    expect(screen.getByText('Modelo de petição')).toBeInTheDocument();
  });

  test('navega para detalhe ao clicar no documento', () => {
    render(<KnowledgeList documents={docs} query="" onQueryChange={() => {}} onSearch={() => {}} onNew={() => {}} onDelete={() => {}} canDelete />);
    fireEvent.click(screen.getByLabelText('Abrir documento Tese danos morais'));
    expect(mockPush).toHaveBeenCalledWith('/knowledge/d-001');
  });

  test('dispara onSearch e onNew', () => {
    const onSearch = jest.fn();
    const onNew = jest.fn();
    render(<KnowledgeList documents={docs} query="" onQueryChange={() => {}} onSearch={onSearch} onNew={onNew} onDelete={() => {}} canDelete={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(onSearch).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Novo documento'));
    expect(onNew).toHaveBeenCalled();
  });

  test('exibe mensagem quando lista está vazia', () => {
    render(<KnowledgeList documents={[]} query="" onQueryChange={() => {}} onSearch={() => {}} onNew={() => {}} onDelete={() => {}} canDelete={false} />);
    expect(screen.getByText('Nenhum documento encontrado.')).toBeInTheDocument();
  });
});
