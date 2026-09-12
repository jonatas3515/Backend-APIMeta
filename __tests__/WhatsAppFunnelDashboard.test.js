import { render, screen } from '@testing-library/react';
import WhatsAppFunnelDashboard from '../components/WhatsAppFunnelDashboard';

global.fetch = jest.fn();

describe('WhatsAppFunnelDashboard', () => {
  beforeEach(() => {
    fetch.mockClear();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        totalConversations: 10,
        totalMessages: 50,
        conversionRate: 20,
        eventDistribution: { first_contact: 10, closed: 2 },
        volumeByDay: [{ date: '2026-01-15', inbound: 3, outbound: 2 }]
      })
    });
  });

  test('exibe tela de carregamento', () => {
    render(<WhatsAppFunnelDashboard from="2026-01-01" to="2026-01-31" />);
    expect(screen.getByText('Carregando funil de WhatsApp...')).toBeInTheDocument();
  });
});
