import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const { method } = req;

  try {
    if (method === 'GET') {
      return handleGet(req, res);
    } else if (method === 'POST') {
      return handlePost(req, res);
    } else if (method === 'PATCH') {
      return handlePatch(req, res);
    } else {
      return res.status(405).json({ error: 'Método não permitido' });
    }
  } catch (error) {
    console.error('[CASES] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });

async function handleGet(req, res) {
  const { id, conversation_id, status, priority, legal_area, municipality } = req.query;

  try {
    let query = supabase.from('cases').select('*');

    if (id) {
      query = query.eq('id', id).single();
    } else {
      if (conversation_id) query = query.eq('conversation_id', conversation_id);
      if (status) query = query.eq('status', status);
      if (priority) query = query.eq('priority', priority);
      if (legal_area) query = query.eq('legal_area', legal_area);
      if (municipality) query = query.eq('municipality', municipality);

      query = query.order('deadline_date', { ascending: true, nullsFirst: false });
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json(data);
  } catch (error) {
    console.error('[CASES] Erro ao listar casos:', error);
    return res.status(500).json({ error: 'Erro ao listar casos' });
  }
}

async function handlePost(req, res) {
  const {
    conversation_id,
    title,
    legal_area,
    case_type,
    municipality,
    agency,
    client_role,
    status,
    priority,
    deadline_date,
    deadline_type,
    notes
  } = req.body;

  // Validar permissão
  const userRole = req.user?.role;
  if (userRole !== 'admin' && userRole !== 'advogado') {
    return res.status(403).json({ error: 'Apenas admin e advogado podem criar casos' });
  }

  if (!title) {
    return res.status(400).json({ error: 'Título do caso é obrigatório' });
  }

  try {
    // Verificar se já existe caso ativo para esta conversa
    if (conversation_id) {
      const { data: existingCases, error: checkError } = await supabase
        .from('cases')
        .select('id, status, title')
        .eq('conversation_id', conversation_id)
        .neq('status', 'encerrado');

      if (checkError) {
        console.error('[CASES] Erro ao verificar casos existentes:', checkError);
      } else if (existingCases && existingCases.length > 0) {
        return res.status(409).json({
          error: 'Esta conversa já possui um caso ativo vinculado',
          existingCase: existingCases[0]
        });
      }
    }
    const insertData = {
      conversation_id: conversation_id || null,
      title,
      legal_area: legal_area || null,
      case_type: case_type || null,
      municipality: municipality || null,
      agency: agency || null,
      client_role: client_role || null,
      status: status || 'prospect',
      priority: priority || 'media',
      deadline_date: deadline_date || null,
      deadline_type: deadline_type || null,
      notes: notes || null
    };

    const { data, error } = await supabase
      .from('cases')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[CASES] Erro no banco:', error);
      return res.status(400).json({
        error: 'Não foi possível criar o caso. Verifique os dados e tente novamente.'
      });
    }

    console.log(`[CASES] Caso criado: ${data.id}`);
    return res.status(201).json(data);
  } catch (error) {
    console.error('[CASES] Erro ao criar caso:', error);
    return res.status(500).json({
      error: 'Erro ao criar caso. Tente novamente em instantes.'
    });
  }
}

async function handlePatch(req, res) {
  const { id } = req.query;
  const updates = req.body;

  // Validar permissão
  const userRole = req.user?.role;
  if (userRole !== 'admin' && userRole !== 'advogado') {
    return res.status(403).json({ error: 'Apenas admin e advogado podem atualizar casos' });
  }

  if (!id) {
    return res.status(400).json({ error: 'ID do caso é obrigatório' });
  }

  try {
    // Se está alterando conversation_id, verificar caso ativo
    if (updates.conversation_id) {
      const { data: existingCases, error: checkError } = await supabase
        .from('cases')
        .select('id, status, title')
        .eq('conversation_id', updates.conversation_id)
        .neq('status', 'encerrado')
        .neq('id', id);

      if (checkError) {
        console.error('[CASES] Erro ao verificar casos existentes:', checkError);
      } else if (existingCases && existingCases.length > 0) {
        return res.status(409).json({
          error: 'A conversa de destino já possui um caso ativo vinculado',
          existingCase: existingCases[0]
        });
      }
    }
    const { data, error } = await supabase
      .from('cases')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    console.log(`[CASES] Caso atualizado: ${id}`);
    return res.status(200).json(data);
  } catch (error) {
    console.error('[CASES] Erro ao atualizar caso:', error);
    return res.status(500).json({ error: 'Erro ao atualizar caso' });
  }
}
