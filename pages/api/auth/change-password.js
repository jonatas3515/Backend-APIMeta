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
    const { username, email, name, newPassword } = req.body;

    if (!username || !newPassword) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    // Gerar hash SHA256 da nova senha
    const passwordHash = crypto.createHash('sha256').update(newPassword).digest('hex');

    // Verificar se usuário existe
    const { data: existingUser } = await supabase
      .from('chat_admin_users')
      .select('id')
      .eq('username', username)
      .single();

    if (existingUser) {
      // Atualizar usuário existente
      const { error } = await supabase
        .from('chat_admin_users')
        .update({ 
          password_hash: passwordHash,
          email: email || null,
          name: name || username
        })
        .eq('username', username);

      if (error) throw error;

      console.log('[CHANGE-PASSWORD] Senha atualizada para:', username);
      return res.status(200).json({ 
        success: true, 
        message: 'Senha atualizada com sucesso!' 
      });
    } else {
      // Criar novo usuário
      const { error } = await supabase
        .from('chat_admin_users')
        .insert([{
          username,
          password_hash: passwordHash,
          email: email || null,
          name: name || username
        }]);

      if (error) throw error;

      console.log('[CHANGE-PASSWORD] Novo usuário criado:', username);
      return res.status(200).json({ 
        success: true, 
        message: 'Usuário criado com sucesso!' 
      });
    }
  } catch (error) {
    console.error('[CHANGE-PASSWORD] Erro:', error);
    return res.status(500).json({ error: error.message });
  }
}
