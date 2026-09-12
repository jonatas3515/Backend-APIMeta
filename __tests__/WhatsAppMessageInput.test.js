import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import WhatsAppMessageInput from '../components/WhatsAppMessageInput';

global.fetch = jest.fn();

describe('WhatsAppMessageInput', () => {
  beforeEach(() => {
    fetch.mockClear();
    fetch.mockResolvedValue({ ok: true, json: async () => [] });
  });

  test('renderiza campo e botão de envio', () => {
    render(<WhatsAppMessageInput conversationId="c1" />);
    expect(screen.getByLabelText('Digite uma mensagem para enviar pelo WhatsApp')).toBeInTheDocument();
    expect(screen.getByLabelText('Enviar mensagem pelo WhatsApp')).toBeInTheDocument();
  });

  test('envia mensagem de texto', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const onSent = jest.fn();
    render(<WhatsAppMessageInput conversationId="c1" onSent={onSent} />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Digite uma mensagem para enviar pelo WhatsApp'), { target: { value: 'Oi' } });
      fireEvent.click(screen.getByLabelText('Enviar mensagem pelo WhatsApp'));
      await new Promise(r => setTimeout(r, 0));
    });

    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(fetch).toHaveBeenLastCalledWith('/api/whatsapp/send-message', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"type":"text"')
    }));
  });
});
