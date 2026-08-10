import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    // Buscar usuário na tabela chat_admin_users
    const { data: user, error } = await supabase
      .from('chat_admin_users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !user) {
      console.log('[AUTH] Usuário não encontrado:', username);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Verificar senha (hash SHA256)
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    
    if (user.password_hash !== passwordHash) {
      console.log('[AUTH] Senha incorreta para:', username);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Gerar token simples (em produção, use JWT)
    const token = crypto.randomBytes(32).toString('hex');
    
    // Atualizar último login
    await supabase
      .from('chat_admin_users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    console.log('[AUTH] Login bem-sucedido:', username);

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name
      }
    });
  } catch (error) {
    console.error('[AUTH] Erro:', error);
    return res.status(500).json({ error: error.message });
  }
}
