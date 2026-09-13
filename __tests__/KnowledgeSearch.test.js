import { render, screen, fireEvent } from '@testing-library/react';
import KnowledgeSearch from '../components/KnowledgeSearch';

describe('KnowledgeSearch', () => {
  test('chama onSearch com a query ao enviar', () => {
    const onSearch = jest.fn();
    render(<KnowledgeSearch onSearch={onSearch} results={[]} />);
    fireEvent.change(screen.getByPlaceholderText('Busca avançada...'), { target: { value: 'danos morais' } });
    fireEvent.click(screen.getByLabelText('Executar busca'));
    expect(onSearch).toHaveBeenCalledWith('danos morais');
  });

  test('renderiza resultados de busca', () => {
    const results = [
      { documentId: 'd-001', chunkIndex: 0, title: 'Tese', type: 'tese', content: 'Trecho relevante' }
    ];
    render(<KnowledgeSearch onSearch={() => {}} results={results} />);
    expect(screen.getByText('Tese')).toBeInTheDocument();
    expect(screen.getByText('Trecho relevante')).toBeInTheDocument();
  });
});
