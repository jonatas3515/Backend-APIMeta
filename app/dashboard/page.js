'use client';

import { useEffect } from 'react';

// /dashboard agora vive como aba interna do painel (/?tab=dashboard).
// Redirect seguro sem next/router (App Router).
export default function DashboardRedirect() {
  useEffect(() => {
    window.location.replace('/?tab=dashboard');
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <p className="text-gray-500 text-sm">Redirecionando para o painel...</p>
    </div>
  );
}
