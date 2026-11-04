import { useState, useEffect, useContext, createContext } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext();

const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutos de inatividade

const markSessionActive = () => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem('jusjnc_session_active', 'true');
    document.cookie = 'nc_session_active=true; path=/; SameSite=Lax';
    localStorage.setItem('jusjnc_last_activity', String(Date.now()));
  } catch (_) {}
};

const clearSessionMarkers = () => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem('jusjnc_session_active');
    document.cookie = 'nc_session_active=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    localStorage.removeItem('jusjnc_last_activity');
    localStorage.removeItem('jusjnc_active_tab');
  } catch (_) {}
};

const isSessionActiveInBrowser = () => {
  if (typeof window === 'undefined') return true;
  try {
    const hasSessionStorage = sessionStorage.getItem('jusjnc_session_active') === 'true';
    const hasCookie = typeof document !== 'undefined' && document.cookie.includes('nc_session_active=true');
    return hasSessionStorage || hasCookie;
  } catch (_) {
    return true;
  }
};

const isSessionInactive = () => {
  if (typeof window === 'undefined') return false;
  try {
    const last = Number(localStorage.getItem('jusjnc_last_activity') || 0);
    if (!last) return false;
    return (Date.now() - last) >= INACTIVITY_TIMEOUT_MS;
  } catch (_) {
    return false;
  }
};

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
        markSessionActive();
        setAuthUser(session.user);
        loadUserProfile(session.user.id);
      } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        clearSessionMarkers();
        setAuthUser(null);
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Monitora inatividade (20min) e desconecta automaticamente
  useEffect(() => {
    if (!authUser || typeof window === 'undefined') return;

    let lastRecorded = Date.now();

    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastRecorded > 10000) {
        lastRecorded = now;
        try {
          localStorage.setItem('jusjnc_last_activity', String(now));
        } catch (_) {}
      }
    };

    const verifyInactivity = () => {
      if (isSessionInactive()) {
        console.warn('[AUTH] Desconectando por 20 minutos de inatividade.');
        signOut();
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));

    const interval = setInterval(verifyInactivity, 15000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        verifyInactivity();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', verifyInactivity);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', verifyInactivity);
    };
  }, [authUser]);

  const checkSession = async () => {
    try {
      if (typeof window !== 'undefined') {
        const active = isSessionActiveInBrowser();
        const inactive = isSessionInactive();

        // Se o navegador foi fechado ou se passaram 20 minutos de inatividade
        if (!active || inactive) {
          clearSessionMarkers();
          await supabase.auth.signOut().catch(() => {});
          setAuthUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }
      }

      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (session) {
        markSessionActive();
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
        markSessionActive();
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
      clearSessionMarkers();
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
