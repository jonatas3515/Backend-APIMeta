import '../styles/globals.css';
import { AuthProvider } from '../lib/useAuth';
import GlobalSearch from '../components/GlobalSearch';

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
      <GlobalSearch />
    </AuthProvider>
  );
}

export default MyApp;
