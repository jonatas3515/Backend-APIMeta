'use client';

import '../styles/globals.css';
import { AuthProvider } from '../lib/useAuth';

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
