import { createClient } from '@supabase/supabase-js';
import { verifyAuthAndGetUser, requireRole } from '@/lib/auth';

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
    // Todos os métodos requerem autenticação
    const { profile } = await verifyAuthAndGetUser(req);

    if (req.method === 'GET') {
      return handleGet(req, res, profile);
    } else if (req.method === 'POST') {
      return handlePost(req, res, profile);
    } else if (req.method === 'PATCH') {
      return handlePatch(req, res, profile);
    } else if (req.method === 'DELETE') {
      return handleDelete(req, res, profile);
    } else {
      return res.status(405).json({ error: 'Método não permitido' });
    }
  } catch (error) {
    console.error('[USERS] request_failed:', error.message);
    return res.status(401).json({ error: error.message });
  }
}

async function handleGet(req, res, profile) {
  // Admin vê todos; advogado vê estagiários; estagiário não vê nada
  if (profile.role === 'estagiario') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  let query = supabase.from('users').select('id, name, email, role, is_active, created_at, auth_user_id');

  if (profile.role === 'advogado') {
    // Advogado vê apenas estagiários
    query = query.eq('role', 'estagiario');
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw error;

  return res.status(200).json(data || []);
}

async function handlePost(req, res, profile) {
  const { name, email, role, password } = req.body;

  if (!name || !email || !role || !password) {
    return res.status(400).json({ error: 'Nome, email, papel e senha são obrigatórios' });
  }

  // Valida permissões de criação
  if (profile.role === 'estagiario') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  if (profile.role === 'advogado' && role !== 'estagiario') {
    return res.status(403).json({ error: 'Advogado só pode criar estagiários' });
  }

  if (!['admin', 'advogado', 'estagiario'].includes(role)) {
    return res.status(400).json({ error: 'Papel inválido' });
  }

  try {
    // 1. Cria usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        return res.status(409).json({ error: 'Email já cadastrado no Supabase Auth' });
      }
      throw authError;
    }

    const authUserId = authData.user.id;

    // 2. Insere/atualiza na tabela users
    const { data: existing, error: existingError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    let userId;

    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from('users')
        .update({ name, role, is_active: true, auth_user_id: authUserId })
        .eq('id', existing.id)
        .select('id')
        .single();

      if (updateError) throw updateError;
      userId = updated.id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('users')
        .insert({ name, email, role, is_active: true, auth_user_id: authUserId })
        .select('id')
        .single();

      if (insertError) throw insertError;
      userId = inserted.id;
    }

    // 3. Registra audit log
    await supabase.rpc('log_audit', {
      p_user_id: profile.id,
      p_entity_type: 'user',
      p_entity_id: userId,
      p_action: 'create',
      p_new_value: `${name} (${email}) - ${role}`,
      p_details: JSON.stringify({ role, created_by: profile.email })
    });

    return res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso',
      user: {
        id: userId,
        name,
        email,
        role,
        auth_user_id: authUserId
      }
    });
  } catch (error) {
    console.error('[USERS] create_user_failed:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

async function handlePatch(req, res, profile) {
  const { id, name, role, is_active } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'ID do usuário é obrigatório' });
  }

  // Admin pode tudo; advogado só pode editar estagiários
  if (profile.role === 'estagiario') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  // Verifica se alvo é estagiário (para advogado)
  if (profile.role === 'advogado') {
    const { data: target } = await supabase
      .from('users')
      .select('role')
      .eq('id', id)
      .single();

    if (!target || target.role !== 'estagiario') {
      return res.status(403).json({ error: 'Advogado só pode editar estagiários' });
    }
  }

  // Evita que advogado promova para admin ou advogado
  if (profile.role === 'advogado' && (role === 'admin' || role === 'advogado')) {
    return res.status(403).json({ error: 'Advogado só pode manter estagiários' });
  }

  const updateData = {};
  if (name) updateData.name = name;
  if (role) updateData.role = role;
  if (is_active !== undefined) updateData.is_active = is_active;

  try {
    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select('id, name, email, role, is_active')
      .single();

    if (error) throw error;

    // Registra audit log
    await supabase.rpc('log_audit', {
      p_user_id: profile.id,
      p_entity_type: 'user',
      p_entity_id: id,
      p_action: 'update',
      p_new_value: JSON.stringify(updateData),
      p_details: JSON.stringify({ updated_by: profile.email })
    });

    return res.status(200).json(data);
  } catch (error) {
    console.error('[USERS] update_user_failed:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

async function handleDelete(req, res, profile) {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'ID do usuário é obrigatório' });
  }

  // Apenas admin pode desativar (não exclui de verdade)
  if (profile.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .update({ is_active: false })
      .eq('id', id)
      .select('id, name, email, is_active')
      .single();

    if (error) throw error;

    // Registra audit log
    await supabase.rpc('log_audit', {
      p_user_id: profile.id,
      p_entity_type: 'user',
      p_entity_id: id,
      p_action: 'disable',
      p_new_value: 'is_active: false',
      p_details: JSON.stringify({ disabled_by: profile.email })
    });

    return res.status(200).json({
      success: true,
      message: 'Usuário desativado com sucesso',
      user: data
    });
  } catch (error) {
    console.error('[USERS] disable_user_failed:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
