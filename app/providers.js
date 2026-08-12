'use client';

import { AuthProvider } from '../lib/useAuth';

export default function Providers({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
