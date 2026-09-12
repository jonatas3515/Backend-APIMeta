import { render, screen } from '@testing-library/react';
import WhatsAppFunnelEvents from '../components/WhatsAppFunnelEvents';

describe('WhatsAppFunnelEvents', () => {
  test('renderiza eventos', () => {
    const events = [
      { id: 'e1', to_stage: 'first_contact', created_at: '2026-01-15T10:00:00Z', conversation_id: 'c1', changed_by: 'system' }
    ];
    render(<WhatsAppFunnelEvents events={events} />);
    expect(screen.getByText('Primeiro contato')).toBeInTheDocument();
    expect(screen.getByText('c1')).toBeInTheDocument();
  });

  test('exibe mensagem quando vazio', () => {
    render(<WhatsAppFunnelEvents events={[]} />);
    expect(screen.getByText('Nenhum evento de funil registrado.')).toBeInTheDocument();
  });
});
