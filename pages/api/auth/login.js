import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    // Faz login no Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.log('[AUTH] login_failed reason=invalid_credentials');
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const authUser = data.user;
    const session = data.session;

    // Busca perfil na tabela users
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, name, email, role, is_active, auth_user_id')
      .eq('auth_user_id', authUser.id)
      .single();

    if (profileError || !profile) {
      console.log('[AUTH] profile_not_found');
      return res.status(403).json({
        error: 'Perfil não encontrado. Entre em contato com o administrador.'
      });
    }

    if (!profile.is_active) {
      return res.status(403).json({
        error: 'Usuário inativo. Entre em contato com o administrador.'
      });
    }

    // Atualiza último acesso
    await supabase
      .from('users')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', profile.id);

    console.log('[AUTH] login_success role=' + profile.role);

    return res.status(200).json({
      success: true,
      token: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at,
      user: {
        id: profile.id,
        auth_user_id: authUser.id,
        email: profile.email,
        name: profile.name,
        role: profile.role
      }
    });
  } catch (error) {
    console.error('[AUTH] authentication_failed reason=internal_error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
