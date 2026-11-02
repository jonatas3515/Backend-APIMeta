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
        .select('id, name, email, role, is_active, preferred_legal_area, office_id, is_master')
        .eq('auth_user_id', authUserId)
        .single();

      if (error) throw error;

      // Se tiver office_id, carrega dados do escritório
      let officeData = null;
      if (data?.office_id) {
        try {
          const { data: off } = await supabase
            .from('offices')
            .select('id, name, plan, status, trial_ends_at')
            .eq('id', data.office_id)
            .maybeSingle();
          officeData = off || null;
        } catch (_) {}
      }

      const isMaster = Boolean(data.is_master || data.email === 'jonatascosta.adv@gmail.com');

      setProfile({
        ...data,
        is_master: isMaster,
        office: officeData
      });
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
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('jusjnc_active_tab');
        } catch (e) {}
      }
      await supabase.auth.signOut();
      setAuthUser(null);
      setProfile(null);
    } catch (error) {
      console.error('[AUTH] Erro ao fazer logout:', error);
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile?.email,
        password: currentPassword
      });

      if (signInError) {
        return { success: false, error: 'Senha atual incorreta' };
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const canAccess = (minimumRole) => {
    if (!profile) return false;
    const hierarchy = { admin: 3, advogado: 2, estagiario: 1 };
    return (hierarchy[profile.role] || 0) >= (hierarchy[minimumRole] || 0);
  };

  const value = {
    authUser,
    profile,
    loading,
    signIn,
    signOut,
    changePassword,
    canAccess,
    isMaster: () => Boolean(profile?.is_master || profile?.email === 'jonatascosta.adv@gmail.com'),
    isAdmin: () => profile?.role === 'admin',
    isAdvogado: () => profile?.role === 'advogado' || profile?.role === 'admin',
    isEstagiario: () => profile?.role === 'estagiario',
    office: profile?.office
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
