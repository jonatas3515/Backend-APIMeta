import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockChangePassword = jest.fn();
jest.mock('../lib/useAuth', () => ({
  useAuth: () => ({
    authUser: { id: 'auth-1' },
    profile: { id: 'u1', name: 'Dr. Ana', email: 'ana@x.com', role: 'advogado' },
    loading: false,
    signOut: jest.fn(),
    changePassword: mockChangePassword
  })
}));

jest.mock('../components/NotificationSettings', () => ({
  __esModule: true,
  default: () => <div>NotificationSettings</div>
}));
jest.mock('../components/CalendarSettings', () => ({
  __esModule: true,
  default: () => <div>CalendarSettings</div>
}));

const ProfilePanel = require('../components/ProfilePanel').default;

describe('ProfilePanel - Segurança da Conta', () => {
  beforeEach(() => {
    mockChangePassword.mockReset();
  });

  test('toggle exibe o formulario de alteracao de senha', async () => {
    render(<ProfilePanel />);
    expect(screen.queryByTestId('password-form')).not.toBeInTheDocument();

    fireEvent.click(await screen.findByTestId('toggle-password-form'));
    expect(screen.getByTestId('password-form')).toBeInTheDocument();
    expect(screen.getByTestId('password-current')).toBeInTheDocument();
    expect(screen.getByTestId('password-new')).toBeInTheDocument();
    expect(screen.getByTestId('password-confirm')).toBeInTheDocument();
  });

  test('senhas divergentes exibem erro sem chamar changePassword', async () => {
    render(<ProfilePanel />);
    fireEvent.click(await screen.findByTestId('toggle-password-form'));

    fireEvent.change(screen.getByTestId('password-current'), { target: { value: 'old123' } });
    fireEvent.change(screen.getByTestId('password-new'), { target: { value: 'new123' } });
    fireEvent.change(screen.getByTestId('password-confirm'), { target: { value: 'different' } });
    fireEvent.click(screen.getByTestId('password-submit'));

    expect(await screen.findByTestId('password-error')).toHaveTextContent('não conferem');
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  test('sucesso chama changePassword e exibe confirmacao', async () => {
    mockChangePassword.mockResolvedValue({ success: true });
    render(<ProfilePanel />);
    fireEvent.click(await screen.findByTestId('toggle-password-form'));

    fireEvent.change(screen.getByTestId('password-current'), { target: { value: 'old123' } });
    fireEvent.change(screen.getByTestId('password-new'), { target: { value: 'new123' } });
    fireEvent.change(screen.getByTestId('password-confirm'), { target: { value: 'new123' } });
    fireEvent.click(screen.getByTestId('password-submit'));

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith('old123', 'new123');
    });
    expect(await screen.findByTestId('password-success')).toHaveTextContent('Senha alterada com sucesso');
    expect(screen.queryByTestId('password-form')).not.toBeInTheDocument();
  });

  test('falha no changePassword exibe erro', async () => {
    mockChangePassword.mockResolvedValue({ success: false, error: 'Senha atual incorreta' });
    render(<ProfilePanel />);
    fireEvent.click(await screen.findByTestId('toggle-password-form'));

    fireEvent.change(screen.getByTestId('password-current'), { target: { value: 'wrong' } });
    fireEvent.change(screen.getByTestId('password-new'), { target: { value: 'new123' } });
    fireEvent.change(screen.getByTestId('password-confirm'), { target: { value: 'new123' } });
    fireEvent.click(screen.getByTestId('password-submit'));

    expect(await screen.findByTestId('password-error')).toHaveTextContent('Senha atual incorreta');
  });
});


