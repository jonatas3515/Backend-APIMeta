import { render, screen } from '@testing-library/react';
import WhatsAppMetricsChart from '../components/WhatsAppMetricsChart';

describe('WhatsAppMetricsChart', () => {
  test('renderiza barras com valores', () => {
    const data = { first_contact: 10, closed: 2 };
    const labels = [{ id: 'first_contact', label: 'Primeiro contato' }, { id: 'closed', label: 'Fechado' }];
    render(<WhatsAppMetricsChart data={data} labels={labels} />);
    expect(screen.getByText('Primeiro contato')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  test('exibe mensagem quando não há dados', () => {
    render(<WhatsAppMetricsChart data={{}} labels={[]} />);
    expect(screen.getByText('Sem dados para exibir.')).toBeInTheDocument();
  });
});
