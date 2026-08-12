import '../styles/globals.css';
import Providers from './providers';

export const metadata = {
  title: 'N&C - Dashboard',
  icons: {
    icon: '/Logo%20transparente.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
