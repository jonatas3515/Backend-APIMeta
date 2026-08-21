import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export default async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  try {
    const email = 'jonatascosta.adv@gmail.com';

    // 1. Buscar usuário no Supabase Auth
    console.log('[DEBUG] Buscando usuário no Auth...');
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(u => u.email === email);

    console.log('[DEBUG] Usuário no Auth:', authUser ? 'ENCONTRADO' : 'NÃO ENCONTRADO');
    if (authUser) {
      console.log('[DEBUG] Auth user localizado');
      console.log('[DEBUG] Conta confirmada:', authUser.email_confirmed_at ? 'SIM' : 'NÃO');
    }

    // 2. Buscar usuário na tabela users
    console.log('[DEBUG] Buscando usuário na tabela users...');
    const { data: dbUsers, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email);

    console.log('[DEBUG] Usuário na DB:', dbUsers?.length > 0 ? 'ENCONTRADO' : 'NÃO ENCONTRADO');
    if (dbUsers?.length > 0) {
      // console.log('[DEBUG] DB User: [REDACTED]');
    }

    // 3. Verificar se auth_user_id está vinculado
    if (authUser && dbUsers?.length > 0) {
      const dbUser = dbUsers[0];
      console.log('[DEBUG] Auth user localizado');
      console.log('[DEBUG] Vinculação presente no DB');
      console.log('[DEBUG] Vinculados:', authUser.id === dbUser.auth_user_id ? 'SIM' : 'NÃO');
    }

    return res.status(200).json({
      email,
      authUser: authUser ? {
        id: authUser.id,
        email: authUser.email,
        email_confirmed_at: authUser.email_confirmed_at
      } : null,
      dbUser: dbUsers?.length > 0 ? dbUsers[0] : null,
      status: authUser && dbUsers?.length > 0 ? 'OK' : 'PROBLEMA'
    });
  } catch (error) {
    console.error('[DEBUG] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
