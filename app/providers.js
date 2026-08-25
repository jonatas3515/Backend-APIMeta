'use client';

import { AuthProvider } from '../lib/useAuth';
import { AreaFilterProvider } from '../contexts/AreaFilterContext';

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <AreaFilterProvider>{children}</AreaFilterProvider>
    </AuthProvider>
  );
}
