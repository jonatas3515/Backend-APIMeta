import { useEffect } from 'react';
import '../styles/globals.css';
import { AuthProvider } from '../lib/useAuth';
import { AreaFilterProvider } from '../contexts/AreaFilterContext';
import { ToastProvider } from '../lib/useToast';
import GlobalSearch from '../components/GlobalSearch';
import KeyboardShortcuts from '../components/KeyboardShortcuts';
import { ToastContainer } from '../components/Toast';

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
      <ToastContainer />
    </>
  );
}

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <AreaFilterProvider>
        <ToastProvider>
          <AppContent Component={Component} pageProps={pageProps} />
        </ToastProvider>
      </AreaFilterProvider>
    </AuthProvider>
  );
}

export default MyApp;
