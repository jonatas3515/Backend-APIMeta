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
    if (method === 'GET') return await handleGet(req, res);
    if (method === 'PATCH') return await handlePatch(req, res);
    if (method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ error: 'Método não permitido' });
  } catch (error) {
    console.error('[TRIAGE] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export default withAuth(handler, { minRole: 'advogado' });

// ============================================================================
// GET - Listar movimentações, estatísticas ou detalhes
// ============================================================================
async function handleGet(req, res) {
  const { action, id } = req.query;

  if (id) {
    return await getMovementDetails(req, res, id);
  }

  if (action === 'list') {
    return await listMovements(req, res);
  }

  if (action === 'stats') {
    return await getStats(req, res);
  }

  return res.status(400).json({ error: 'Ação não especificada' });
}

// ----------------------------------------------------------------------------
// Listar movimentações com filtros
// ----------------------------------------------------------------------------
async function listMovements(req, res) {
  const {
    triage_status,
    legal_classification,
    priority,
    legal_area,
    court_code,
    start_date,
    end_date,
    assigned_user_id,
    page = 1,
    limit = 20
  } = req.query;

  const mine = req.query.mine === 'true';
  const targetAssignedUserId = mine ? req.user.id : assigned_user_id;

  try {
    let query = supabase
      .from('process_movements')
      .select(`
        *,
        assigned_user:users!assigned_user_id(name),
        case_process:case_processes!inner(
          id,
          process_number,
          court_code,
          court_name,
          case:cases!inner(
            id,
            title,
            legal_area,
            assigned_user_id
          )
        )
      `, { count: 'exact' });

    // Filtros
    if (triage_status) {
      query = query.eq('triage_status', triage_status);
    }

    if (legal_classification) {
      query = query.eq('legal_classification', legal_classification);
    }

    if (priority) {
      query = query.eq('priority', priority);
    }

    if (legal_area) {
      query = query.eq('case_process.case.legal_area', legal_area);
    }

    if (court_code) {
      query = query.eq('case_process.court_code', court_code);
    }

    if (start_date) {
      query = query.gte('movement_date', start_date);
    }

    if (end_date) {
      query = query.lte('movement_date', end_date);
    }

    if (targetAssignedUserId) {
      if (targetAssignedUserId === 'unassigned') {
        query = query.is('assigned_user_id', null);
      } else {
        query = query.eq('assigned_user_id', targetAssignedUserId);
      }
    }

    // Ordenação e paginação
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query
      .order('movement_date', { ascending: false })
      .order('detected_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return res.status(200).json({
      movements: data || [],
      total: count || 0,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil((count || 0) / parseInt(limit))
    });
  } catch (error) {
    console.error('[TRIAGE] Erro ao listar movimentações:', error);
    return res.status(500).json({ error: 'Erro ao listar movimentações' });
  }
}

// ----------------------------------------------------------------------------
// Estatísticas da fila
// ----------------------------------------------------------------------------
async function getStats(req, res) {
  try {
    const { data: stats, error } = await supabase.rpc('get_triage_stats');

    if (error) {
      // Se a função não existir, calcular manualmente
      const { data: movements, error: countError } = await supabase
        .from('process_movements')
        .select('triage_status, priority, legal_classification, assigned_user_id', { count: 'exact' });

      if (countError) throw countError;

      const myId = req.user.id;
      const activeStatuses = ['novo', 'em_analise'];

      const statsManual = {
        total: movements.length,
        by_status: {},
        by_priority: {},
        by_classification: {},
        my_pendencies: 0
      };

      movements.forEach(m => {
        statsManual.by_status[m.triage_status] = (statsManual.by_status[m.triage_status] || 0) + 1;
        statsManual.by_priority[m.priority] = (statsManual.by_priority[m.priority] || 0) + 1;
        statsManual.by_classification[m.legal_classification] = (statsManual.by_classification[m.legal_classification] || 0) + 1;
        if (activeStatuses.includes(m.triage_status) && m.assigned_user_id === myId) {
          statsManual.my_pendencies += 1;
        }
      });

      return res.status(200).json(statsManual);
    }

    return res.status(200).json(stats);
  } catch (error) {
    console.error('[TRIAGE] Erro ao obter estatísticas:', error);
    return res.status(500).json({ error: 'Erro ao obter estatísticas' });
  }
}

// ----------------------------------------------------------------------------
// Detalhes de movimentação com histórico
// ----------------------------------------------------------------------------
async function getMovementDetails(req, res, id) {
  try {
    const { data: movement, error } = await supabase
      .from('process_movements')
      .select(`
        *,
        assigned_user:users!assigned_user_id(name),
        case_process:case_processes(
          id,
          process_number,
          court_code,
          court_name,
          case:cases(
            id,
            title,
            legal_area,
            municipality,
            agency,
            assigned_user_id
          )
        ),
        note:internal_notes(id, text, created_at),
        reminder:chat_reminders(id, title, scheduled_for, status),
        event:case_events(id, event_type, event_date, description)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!movement) return res.status(404).json({ error: 'Movimentação não encontrada' });

    // Buscar histórico de triagem
    const { data: history, error: historyError } = await supabase
      .from('triage_history')
      .select('*, user:users(name)')
      .eq('movement_id', id)
      .order('created_at', { ascending: false });

    if (historyError) console.error('[TRIAGE] Erro ao buscar histórico:', historyError);

    return res.status(200).json({
      movement,
      history: history || []
    });
  } catch (error) {
    console.error('[TRIAGE] Erro ao obter detalhes:', error);
    return res.status(500).json({ error: 'Erro ao obter detalhes' });
  }
}

// ============================================================================
// PATCH - Atualizar triagem
// ============================================================================
async function handlePatch(req, res) {
  const { id } = req.query;
  const {
    triage_status,
    legal_classification,
    priority,
    assigned_user_id,
    triage_notes
  } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'ID da movimentação é obrigatório' });
  }

  try {
    // Buscar movimentação atual
    const { data: current, error: fetchError } = await supabase
      .from('process_movements')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    if (!current) return res.status(404).json({ error: 'Movimentação não encontrada' });

    // Preparar atualização
    const updates = {
      updated_at: new Date().toISOString()
    };

    if (triage_status !== undefined) updates.triage_status = triage_status;
    if (legal_classification !== undefined) updates.legal_classification = legal_classification;
    if (priority !== undefined) updates.priority = priority;
    if (assigned_user_id !== undefined) updates.assigned_user_id = assigned_user_id;
    if (triage_notes !== undefined) updates.triage_notes = triage_notes;

    // Se está sendo marcado como revisado/convertido, registrar quem e quando
    if (triage_status && triage_status !== 'novo' && triage_status !== 'em_analise' && !current.triaged_at) {
      updates.triaged_by = req.user.id;
      updates.triaged_at = new Date().toISOString();
    }

    // Atualizar movimentação
    const { data: updated, error: updateError } = await supabase
      .from('process_movements')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Registrar no histórico
    const historyEntry = {
      movement_id: id,
      user_id: req.user.id,
      action: 'update_triage',
      old_status: current.triage_status,
      new_status: updates.triage_status || current.triage_status,
      old_classification: current.legal_classification,
      new_classification: updates.legal_classification || current.legal_classification,
      old_priority: current.priority,
      new_priority: updates.priority || current.priority,
      notes: triage_notes
    };

    const { error: historyError } = await supabase
      .from('triage_history')
      .insert(historyEntry);

    if (historyError) console.error('[TRIAGE] Erro ao registrar histórico:', historyError);

    return res.status(200).json(updated);
  } catch (error) {
    console.error('[TRIAGE] Erro ao atualizar triagem:', error);
    return res.status(500).json({ error: 'Erro ao atualizar triagem' });
  }
}

// ============================================================================
// POST - Criar nota, lembrete, evento ou obter sugestão
// ============================================================================
async function handlePost(req, res) {
  const { action } = req.query;

  if (action === 'create_note') {
    return await createNote(req, res);
  }

  if (action === 'create_reminder') {
    return await createReminder(req, res);
  }

  if (action === 'create_event') {
    return await createEvent(req, res);
  }

  if (action === 'suggest') {
    return await getSuggestion(req, res);
  }

  return res.status(400).json({ error: 'Ação não especificada' });
}

// ----------------------------------------------------------------------------
// Criar nota interna
// ----------------------------------------------------------------------------
async function createNote(req, res) {
  const { movement_id, text, is_visible_to_client = false } = req.body;

  if (!movement_id || !text) {
    return res.status(400).json({ error: 'movement_id e text são obrigatórios' });
  }

  try {
    // Buscar movimentação e caso
    const { data: movement, error: fetchError } = await supabase
      .from('process_movements')
      .select('*, case_process:case_processes(case_id, conversation_id:cases(conversation_id))')
      .eq('id', movement_id)
      .single();

    if (fetchError) throw fetchError;
    if (!movement) return res.status(404).json({ error: 'Movimentação não encontrada' });

    const case_id = movement.case_process?.case_id;
    const conversation_id = movement.case_process?.conversation_id?.conversation_id;

    if (!case_id || !conversation_id) {
      return res.status(400).json({ error: 'Caso ou conversa não encontrados' });
    }

    // Criar nota
    const { data: note, error: noteError } = await supabase
      .from('internal_notes')
      .insert({
        conversation_id,
        case_id,
        user_id: req.user.id,
        text,
        is_visible_to_client
      })
      .select()
      .single();

    if (noteError) throw noteError;

    // Atualizar movimentação
    const { error: updateError } = await supabase
      .from('process_movements')
      .update({
        note_id: note.id,
        triage_status: 'convertido_em_nota',
        triaged_by: req.user.id,
        triaged_at: new Date().toISOString()
      })
      .eq('id', movement_id);

    if (updateError) throw updateError;

    // Registrar no histórico
    await supabase.from('triage_history').insert({
      movement_id,
      user_id: req.user.id,
      action: 'create_note',
      new_status: 'convertido_em_nota',
      notes: `Nota criada: ${note.id}`
    });

    return res.status(201).json(note);
  } catch (error) {
    console.error('[TRIAGE] Erro ao criar nota:', error);
    return res.status(500).json({ error: 'Erro ao criar nota' });
  }
}

// ----------------------------------------------------------------------------
// Criar lembrete
// ----------------------------------------------------------------------------
async function createReminder(req, res) {
  const { movement_id, title, message, scheduled_for, reminder_type = 'prazo_judicial', priority = 'media' } = req.body;

  if (!movement_id || !title || !scheduled_for) {
    return res.status(400).json({ error: 'movement_id, title e scheduled_for são obrigatórios' });
  }

  try {
    // Buscar movimentação e caso
    const { data: movement, error: fetchError } = await supabase
      .from('process_movements')
      .select('*, case_process:case_processes(case_id, conversation_id:cases(conversation_id, client_phone))')
      .eq('id', movement_id)
      .single();

    if (fetchError) throw fetchError;
    if (!movement) return res.status(404).json({ error: 'Movimentação não encontrada' });

    const case_id = movement.case_process?.case_id;
    const conversation_id = movement.case_process?.conversation_id?.conversation_id;
    const client_phone = movement.case_process?.conversation_id?.client_phone;

    if (!conversation_id) {
      return res.status(400).json({ error: 'Conversa não encontrada' });
    }

    // Criar lembrete
    const { data: reminder, error: reminderError } = await supabase
      .from('chat_reminders')
      .insert({
        conversation_id,
        case_id,
        client_phone,
        type: reminder_type,
        title,
        message,
        scheduled_for,
        priority,
        reminder_type,
        status: 'pending',
        created_by: req.user.name || req.user.email
      })
      .select()
      .single();

    if (reminderError) throw reminderError;

    // Atualizar movimentação
    const { error: updateError } = await supabase
      .from('process_movements')
      .update({
        reminder_id: reminder.id,
        triage_status: 'convertido_em_lembrete',
        triaged_by: req.user.id,
        triaged_at: new Date().toISOString()
      })
      .eq('id', movement_id);

    if (updateError) throw updateError;

    // Registrar no histórico
    await supabase.from('triage_history').insert({
      movement_id,
      user_id: req.user.id,
      action: 'create_reminder',
      new_status: 'convertido_em_lembrete',
      notes: `Lembrete criado: ${reminder.id}`
    });

    return res.status(201).json(reminder);
  } catch (error) {
    console.error('[TRIAGE] Erro ao criar lembrete:', error);
    return res.status(500).json({ error: 'Erro ao criar lembrete' });
  }
}

// ----------------------------------------------------------------------------
// Criar evento de agenda
// ----------------------------------------------------------------------------
async function createEvent(req, res) {
  const { movement_id, event_date, event_time, event_type, description, priority = 'media', location } = req.body;

  if (!movement_id || !event_date || !event_type) {
    return res.status(400).json({ error: 'movement_id, event_date e event_type são obrigatórios' });
  }

  try {
    // Buscar movimentação e caso
    const { data: movement, error: fetchError } = await supabase
      .from('process_movements')
      .select('*, case_process:case_processes(case_id)')
      .eq('id', movement_id)
      .single();

    if (fetchError) throw fetchError;
    if (!movement) return res.status(404).json({ error: 'Movimentação não encontrada' });

    const case_id = movement.case_process?.case_id;

    if (!case_id) {
      return res.status(400).json({ error: 'Caso não encontrado' });
    }

    // Criar evento
    const { data: event, error: eventError } = await supabase
      .from('case_events')
      .insert({
        case_id,
        event_date,
        event_time,
        event_type,
        description,
        priority,
        location,
        created_by_user_id: req.user.id
      })
      .select()
      .single();

    if (eventError) throw eventError;

    // Atualizar movimentação
    const { error: updateError } = await supabase
      .from('process_movements')
      .update({
        agenda_event_id: event.id,
        triage_status: 'convertido_em_agenda',
        triaged_by: req.user.id,
        triaged_at: new Date().toISOString()
      })
      .eq('id', movement_id);

    if (updateError) throw updateError;

    // Registrar no histórico
    await supabase.from('triage_history').insert({
      movement_id,
      user_id: req.user.id,
      action: 'create_event',
      new_status: 'convertido_em_agenda',
      notes: `Evento criado: ${event.id}`
    });

    return res.status(201).json(event);
  } catch (error) {
    console.error('[TRIAGE] Erro ao criar evento:', error);
    return res.status(500).json({ error: 'Erro ao criar evento' });
  }
}

// ----------------------------------------------------------------------------
// Obter sugestão automática (NÃO definitiva)
// ----------------------------------------------------------------------------
async function getSuggestion(req, res) {
  const { movement_text } = req.body;

  if (!movement_text) {
    return res.status(400).json({ error: 'movement_text é obrigatório' });
  }

  try {
    const { data, error } = await supabase.rpc('suggest_movement_classification', {
      movement_text
    });

    if (error) throw error;

    return res.status(200).json({
      suggested_classification: data[0]?.classification || 'outro',
      suggested_priority: data[0]?.priority || 'media',
      disclaimer: 'Sugestão automática — confirme antes de utilizar.'
    });
  } catch (error) {
    console.error('[TRIAGE] Erro ao obter sugestão:', error);
    return res.status(500).json({ error: 'Erro ao obter sugestão' });
  }
}
