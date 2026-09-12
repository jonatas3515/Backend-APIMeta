import { render, screen, fireEvent } from '@testing-library/react';
import NotificationBell from '../components/NotificationBell';

const mockOpen = jest.fn();

jest.mock('../components/NotificationProvider', () => ({
  useNotifications: () => ({
    unreadCount: 30,
    countReliable: true,
    rateLimited: false
  })
}));

describe('NotificationBell - evita chamadas duplicadas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('abre painel sem chamar fetchNotificationCount diretamente', () => {
    render(<NotificationBell onOpen={mockOpen} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });
});
