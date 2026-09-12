import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../lib/useToast';
import { ToastContainer, Toast } from '../components/Toast';

function TestButton({ message, type }) {
  const { addToast } = useToast();
  return (
    <button onClick={() => addToast(message, type)}>Adicionar</button>
  );
}

function renderWithProvider(children) {
  return render(
    <ToastProvider>
      {children}
      <ToastContainer />
    </ToastProvider>
  );
}

describe('Toast', () => {
  test('renderiza toast com role alert para erro', () => {
    render(<Toast id={1} message="Erro de teste" type="error" onClose={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Erro de teste');
  });

  test('renderiza toast com role status para sucesso', () => {
    render(<Toast id={1} message="Sucesso de teste" type="success" onClose={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Sucesso de teste');
  });

  test('adiciona e exibe toasts atraves do provider', () => {
    renderWithProvider(<TestButton message="Salvo" type="success" />);
    fireEvent.click(screen.getByText('Adicionar'));
    expect(screen.getByText('Salvo')).toBeInTheDocument();
  });

  test('remove toast ao clicar em fechar', () => {
    renderWithProvider(<TestButton message="Aviso" type="warning" />);
    fireEvent.click(screen.getByText('Adicionar'));
    expect(screen.getByText('Aviso')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Fechar notificação'));
    expect(screen.queryByText('Aviso')).not.toBeInTheDocument();
  });

  test('tipos invalidos caem em info', () => {
    renderWithProvider(<TestButton message="Padrao" type="unknown" />);
    fireEvent.click(screen.getByText('Adicionar'));
    expect(screen.getByRole('status')).toHaveTextContent('Padrao');
  });
});
