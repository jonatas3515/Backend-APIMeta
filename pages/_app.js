import { useEffect } from 'react';
import '../styles/globals.css';
import { AuthProvider } from '../lib/useAuth';
import { AreaFilterProvider } from '../contexts/AreaFilterContext';
import GlobalSearch from '../components/GlobalSearch';
import KeyboardShortcuts from '../components/KeyboardShortcuts';

function AppContent({ Component, pageProps }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then(reg => console.log('[SW] Registrado:', reg.scope))
        .catch(err => console.error('[SW] Erro ao registrar:', err));
    }
  }, []);

  return (
    <>
      <Component {...pageProps} />
      <GlobalSearch />
      <KeyboardShortcuts />
    </>
  );
}

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <AreaFilterProvider>
        <AppContent Component={Component} pageProps={pageProps} />
      </AreaFilterProvider>
    </AuthProvider>
  );
}

export default MyApp;
