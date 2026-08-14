import '../styles/globals.css';
import { AuthProvider } from '../lib/useAuth';
import GlobalSearch from '../components/GlobalSearch';
import KeyboardShortcuts from '../components/KeyboardShortcuts';

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
      <GlobalSearch />
      <KeyboardShortcuts />
    </AuthProvider>
  );
}

export default MyApp;
