import { useState, useEffect, useContext, createContext } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verifica sessão ao carregar
    checkSession();

    // Escuta mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setAuthUser(session.user);
        loadUserProfile(session.user.id);
      } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        setAuthUser(null);
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (session) {
        setAuthUser(session.user);
        await loadUserProfile(session.user.id);
      }
    } catch (error) {
      console.error('[AUTH] Erro ao verificar sessão:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserProfile = async (authUserId) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, is_active')
        .eq('auth_user_id', authUserId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('[AUTH] Erro ao carregar perfil:', error);
      setProfile(null);
    }
  };

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      if (data.user) {
        setAuthUser(data.user);
        await loadUserProfile(data.user.id);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setAuthUser(null);
      setProfile(null);
    } catch (error) {
      console.error('[AUTH] Erro ao fazer logout:', error);
    }
  };

  const canAccess = (minimumRole) => {
    if (!profile) return false;
    const hierarchy = { admin: 3, advogado: 2, estagiario: 1 };
    return hierarchy[profile.role] >= hierarchy[minimumRole];
  };

  const value = {
    authUser,
    profile,
    loading,
    signIn,
    signOut,
    canAccess,
    isAdmin: () => profile?.role === 'admin',
    isAdvogado: () => profile?.role === 'advogado' || profile?.role === 'admin',
    isEstagiario: () => profile?.role === 'estagiario'
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
