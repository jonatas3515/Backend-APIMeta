import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  try {
    const { setup_key, email, password } = req.body;

    // Verifica chave de setup
    if (setup_key !== process.env.ADMIN_SETUP_KEY) {
      return res.status(403).json({ error: 'Chave de setup inválida' });
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    // Verifica se já existe admin
    const { data: existingAdmins, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true);

    if (checkError) throw checkError;

    if (existingAdmins && existingAdmins.length > 0) {
      return res.status(400).json({
        error: 'Já existe um admin ativo. Use a tela de gestão de usuários para criar novos usuários.'
      });
    }

    // Cria usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: 'Jonatas Costa' }
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        // Se já existe em Auth, busca o ID
        const { data: existingAuth } = await supabase.auth.admin.listUsers();
        const found = existingAuth.users.find(u => u.email === email);

        if (!found) {
          return res.status(500).json({ error: 'Erro ao localizar usuário existente no Auth' });
        }

        // Atualiza senha
        const { error: updateError } = await supabase.auth.admin.updateUserById(
          found.id,
          { password, email_confirm: true }
        );

        if (updateError) throw updateError;

        // Atualiza users
        const { data: updated, error: userError } = await supabase
          .from('users')
          .update({
            auth_user_id: found.id,
            role: 'admin',
            is_active: true,
            name: 'Jonatas Costa'
          })
          .eq('email', email)
          .select('id, email, role, auth_user_id')
          .single();

        if (userError) throw userError;

        return res.status(200).json({
          success: true,
          message: 'Admin atualizado com sucesso (usuário já existia no Auth)',
          user: updated,
          temporary_password: password
        });
      }
      throw authError;
    }

    // Vincula com tabela users
    const authUserId = authData.user.id;

    const { data: existing, error: existingError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    let userId;

    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from('users')
        .update({
          auth_user_id: authUserId,
          role: 'admin',
          is_active: true,
          name: 'Jonatas Costa'
        })
        .eq('id', existing.id)
        .select('id, email, role, auth_user_id')
        .single();

      if (updateError) throw updateError;
      userId = updated.id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('users')
        .insert({
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Jonatas Costa',
          email,
          role: 'admin',
          is_active: true,
          auth_user_id: authUserId
        })
        .select('id, email, role, auth_user_id')
        .single();

      if (insertError) throw insertError;
      userId = inserted.id;
    }

    // Registra audit log
    await supabase.rpc('log_audit', {
      p_user_id: userId,
      p_entity_type: 'user',
      p_entity_id: userId,
      p_action: 'create',
      p_new_value: `${email} - admin (setup)`,
      p_details: JSON.stringify({ setup: true })
    });

    return res.status(201).json({
      success: true,
      message: 'Admin criado com sucesso',
      user: {
        id: userId,
        email,
        role: 'admin',
        auth_user_id: authUserId
      },
      temporary_password: password
    });
  } catch (error) {
    console.error('[SETUP-ADMIN] Erro:', error);
    return res.status(500).json({ error: error.message });
  }
}
