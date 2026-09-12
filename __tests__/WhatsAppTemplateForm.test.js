import { render, screen, fireEvent, act } from '@testing-library/react';
import WhatsAppTemplateForm from '../components/WhatsAppTemplateForm';

global.fetch = jest.fn();

describe('WhatsAppTemplateForm', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  test('submete dados e chama onSuccess', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 't1' }) });
    const onSuccess = jest.fn();
    render(<WhatsAppTemplateForm onSuccess={onSuccess} onCancel={() => {}} />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'saudacao' } });
      fireEvent.change(screen.getByLabelText('Conteúdo'), { target: { value: 'Olá {{1}}' } });
      fireEvent.change(screen.getByLabelText('Variáveis (ex: 1,2,3)'), { target: { value: '1' } });
      fireEvent.click(screen.getByText('Salvar'));
      await new Promise(r => setTimeout(r, 0));
    });

    expect(onSuccess).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('/api/whatsapp/templates', expect.any(Object));
  });

  test('exibe mensagem de erro em caso de falha', async () => {
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Erro do servidor' }) });
    render(<WhatsAppTemplateForm onSuccess={() => {}} onCancel={() => {}} />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'saudacao' } });
      fireEvent.change(screen.getByLabelText('Conteúdo'), { target: { value: 'Olá {{1}}' } });
      fireEvent.change(screen.getByLabelText('Variáveis (ex: 1,2,3)'), { target: { value: '1' } });
      fireEvent.click(screen.getByText('Salvar'));
      await new Promise(r => setTimeout(r, 0));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Erro do servidor');
  });
});
