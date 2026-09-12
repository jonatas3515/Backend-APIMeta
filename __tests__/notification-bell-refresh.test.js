import { render, screen, fireEvent } from '@testing-library/react';
import NotificationBell from '../components/NotificationBell';

const mockFetch = jest.fn();
const mockOpen = jest.fn();

jest.mock('../components/NotificationProvider', () => ({
  useNotifications: () => ({
    unreadCount: 30,
    countReliable: true,
    rateLimited: false,
    fetchNotificationCount: mockFetch
  })
}));

describe('NotificationBell - refresh de contador ao abrir', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('chama API de count com refresh ao clicar no sino', () => {
    render(<NotificationBell onOpen={mockOpen} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(mockFetch).toHaveBeenCalledWith({ force: true });
    expect(mockOpen).toHaveBeenCalled();
  });
});
