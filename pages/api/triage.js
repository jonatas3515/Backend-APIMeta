import { createClient } from '@supabase/supabase-js';
import { withAuth, getTenantOfficeId } from '@/lib/auth';
import { canAccessFeature } from '@/lib/plans';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const profile = req.user;
  const office = profile?.office;
  const isMasterOrMatriz = profile?.is_master || office?.id === '00000000-0000-0000-0000-000000000001';
  const hasAccess = isMasterOrMatriz || canAccessFeature(office?.plan, 'triage_ai', office);

  if (!hasAccess) {
    return res.status(403).json({
      error: 'A Central de Triagem com IA é exclusiva do Plano Enterprise.',
      upgradeRequired: true,
      requiredPlan: 'Enterprise'
    });
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
// Listar movimentações com filtros isoladas por escritório
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
    limit = 25
  } = req.query;

  const officeId = getTenantOfficeId(req);
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
          office_id,
          case:cases!inner(
            id,
            title,
            legal_area,
            assigned_user_id,
            office_id
          )
        )
      `, { count: 'exact' });

    // Isolamento multi-tenancy estrito por escritório
    if (!req.user?.is_master) {
      query = query.eq('office_id', officeId);
    } else if (req.query.office_id) {
      query = query.eq('office_id', req.query.office_id);
    }

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
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    query = query
      .order('movement_date', { ascending: false })
      .range(offset, offset + parseInt(limit, 10) - 1);

    const { data: movements, error, count } = await query;

    if (error) {
      console.error('[TRIAGE] Erro ao listar movimentações:', error);
      return res.status(500).json({ error: 'Erro ao listar movimentações' });
    }

    return res.status(200).json({
      movements: movements || [],
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / parseInt(limit, 10))
      }
    });
  } catch (error) {
    console.error('[TRIAGE] Erro ao listar movimentações:', error);
    return res.status(500).json({ error: 'Erro ao listar movimentações' });
  }
}

// ----------------------------------------------------------------------------
// Estatísticas da fila isoladas por escritório
// ----------------------------------------------------------------------------
async function getStats(req, res) {
  const officeId = getTenantOfficeId(req);

  try {
    let query = supabase
      .from('process_movements')
      .select('triage_status, priority, legal_classification, assigned_user_id', { count: 'exact' });

    if (!req.user?.is_master) {
      query = query.eq('office_id', officeId);
    } else if (req.query.office_id) {
      query = query.eq('office_id', req.query.office_id);
    }

    const { data: movements, error: countError } = await query;

    if (countError) throw countError;

    const myId = req.user.id;
    const activeStatuses = ['novo', 'em_analise'];

    const stats = {
      total: movements?.length || 0,
      by_status: {},
      by_priority: {},
      by_classification: {},
      my_pendencies: 0
    };

    (movements || []).forEach(m => {
      stats.by_status[m.triage_status] = (stats.by_status[m.triage_status] || 0) + 1;
      stats.by_priority[m.priority] = (stats.by_priority[m.priority] || 0) + 1;
      stats.by_classification[m.legal_classification] = (stats.by_classification[m.legal_classification] || 0) + 1;
      if (activeStatuses.includes(m.triage_status) && m.assigned_user_id === myId) {
        stats.my_pendencies += 1;
      }
    });

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
  const officeId = getTenantOfficeId(req);

  try {
    let query = supabase
      .from('process_movements')
      .select(`
        *,
        assigned_user:users!assigned_user_id(name),
        case_process:case_processes(
          id,
          process_number,
          court_code,
          court_name,
          office_id,
          case:cases(
            id,
            title,
            legal_area,
            municipality,
            agency,
            assigned_user_id,
            office_id
          )
        ),
        note:internal_notes(id, text, created_at),
        reminder:chat_reminders(id, title, scheduled_for, status),
        event:case_events(id, event_type, event_date, description)
      `)
      .eq('id', id);

    if (!req.user?.is_master) {
      query = query.eq('office_id', officeId);
    }

    const { data: movement, error } = await query.single();

    if (error || !movement) {
      return res.status(404).json({ error: 'Movimentação não encontrada' });
    }

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
  const officeId = getTenantOfficeId(req);
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
    let fetchQuery = supabase
      .from('process_movements')
      .select('*')
      .eq('id', id);

    if (!req.user?.is_master) {
      fetchQuery = fetchQuery.eq('office_id', officeId);
    }

    const { data: current, error: fetchError } = await fetchQuery.single();

    if (fetchError || !current) {
      return res.status(404).json({ error: 'Movimentação não encontrada' });
    }

    const updates = {
      updated_at: new Date().toISOString()
    };

    if (triage_status !== undefined) updates.triage_status = triage_status;
    if (legal_classification !== undefined) updates.legal_classification = legal_classification;
    if (priority !== undefined) updates.priority = priority;
    if (assigned_user_id !== undefined) updates.assigned_user_id = assigned_user_id;
    if (triage_notes !== undefined) updates.triage_notes = triage_notes;

    if (triage_status && triage_status !== 'novo' && triage_status !== 'em_analise' && !current.triaged_at) {
      updates.triaged_by = req.user.id;
      updates.triaged_at = new Date().toISOString();
    }

    if (triage_status && triage_status !== 'novo' && triage_status !== 'em_analise' && !current.reviewed_at) {
      updates.reviewed_by = req.user.id;
      updates.reviewed_at = new Date().toISOString();
    }

    const { data: updated, error: updateError } = await supabase
      .from('process_movements')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    const historyEntry = {
      movement_id: id,
      user_id: req.user.id,
      office_id: officeId,
      action: 'update_triage',
      old_status: current.triage_status,
      new_status: updates.triage_status || current.triage_status,
      old_classification: current.legal_classification,
      new_classification: updates.legal_classification || current.legal_classification,
      old_priority: current.priority,
      new_priority: updates.priority || current.priority,
      notes: triage_notes
    };

    await supabase.from('triage_history').insert(historyEntry);

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

async function createNote(req, res) {
  const { movement_id, text, is_visible_to_client = false } = req.body;
  const officeId = getTenantOfficeId(req);

  if (!movement_id || !text) {
    return res.status(400).json({ error: 'movement_id e text são obrigatórios' });
  }

  try {
    let query = supabase
      .from('process_movements')
      .select('*, case_process:case_processes(case_id, conversation_id:cases(conversation_id))')
      .eq('id', movement_id);

    if (!req.user?.is_master) {
      query = query.eq('office_id', officeId);
    }

    const { data: movement, error: fetchError } = await query.single();

    if (fetchError || !movement) return res.status(404).json({ error: 'Movimentação não encontrada' });

    const case_id = movement.case_process?.case_id;
    const conversation_id = movement.case_process?.conversation_id?.conversation_id;

    if (!case_id || !conversation_id) {
      return res.status(400).json({ error: 'Caso ou conversa não encontrados' });
    }

    const { data: note, error: noteError } = await supabase
      .from('internal_notes')
      .insert({
        conversation_id,
        case_id,
        user_id: req.user.id,
        office_id: officeId,
        text,
        is_visible_to_client
      })
      .select()
      .single();

    if (noteError) throw noteError;

    await supabase
      .from('process_movements')
      .update({ note_id: note.id, updated_at: new Date().toISOString() })
      .eq('id', movement_id);

    return res.status(200).json(note);
  } catch (error) {
    console.error('[TRIAGE] Erro ao criar nota:', error);
    return res.status(500).json({ error: 'Erro ao criar nota' });
  }
}

async function createReminder(req, res) {
  const { movement_id, title, scheduled_for, priority = 'media' } = req.body;
  const officeId = getTenantOfficeId(req);

  if (!movement_id || !title || !scheduled_for) {
    return res.status(400).json({ error: 'movement_id, title e scheduled_for são obrigatórios' });
  }

  try {
    let query = supabase
      .from('process_movements')
      .select('*, case_process:case_processes(case_id, conversation_id:cases(conversation_id))')
      .eq('id', movement_id);

    if (!req.user?.is_master) {
      query = query.eq('office_id', officeId);
    }

    const { data: movement, error: fetchError } = await query.single();

    if (fetchError || !movement) return res.status(404).json({ error: 'Movimentação não encontrada' });

    const case_id = movement.case_process?.case_id;
    const conversation_id = movement.case_process?.conversation_id?.conversation_id;

    if (!case_id || !conversation_id) {
      return res.status(400).json({ error: 'Caso ou conversa não encontrados' });
    }

    const { data: reminder, error: reminderError } = await supabase
      .from('chat_reminders')
      .insert({
        conversation_id,
        case_id,
        office_id: officeId,
        title,
        scheduled_for,
        priority,
        status: 'pendente'
      })
      .select()
      .single();

    if (reminderError) throw reminderError;

    await supabase
      .from('process_movements')
      .update({ reminder_id: reminder.id, updated_at: new Date().toISOString() })
      .eq('id', movement_id);

    return res.status(200).json(reminder);
  } catch (error) {
    console.error('[TRIAGE] Erro ao criar lembrete:', error);
    return res.status(500).json({ error: 'Erro ao criar lembrete' });
  }
}

async function createEvent(req, res) {
  const { movement_id, event_type, event_date, description } = req.body;
  const officeId = getTenantOfficeId(req);

  if (!movement_id || !event_type || !event_date) {
    return res.status(400).json({ error: 'movement_id, event_type e event_date são obrigatórios' });
  }

  try {
    let query = supabase
      .from('process_movements')
      .select('*, case_process:case_processes(case_id)')
      .eq('id', movement_id);

    if (!req.user?.is_master) {
      query = query.eq('office_id', officeId);
    }

    const { data: movement, error: fetchError } = await query.single();

    if (fetchError || !movement) return res.status(404).json({ error: 'Movimentação não encontrada' });

    const case_id = movement.case_process?.case_id;
    if (!case_id) {
      return res.status(400).json({ error: 'Caso não encontrado' });
    }

    const { data: event, error: eventError } = await supabase
      .from('case_events')
      .insert({
        case_id,
        office_id: officeId,
        event_type,
        event_date,
        description
      })
      .select()
      .single();

    if (eventError) throw eventError;

    await supabase
      .from('process_movements')
      .update({ agenda_event_id: event.id, updated_at: new Date().toISOString() })
      .eq('id', movement_id);

    return res.status(200).json(event);
  } catch (error) {
    console.error('[TRIAGE] Erro ao criar evento:', error);
    return res.status(500).json({ error: 'Erro ao criar evento' });
  }
}

async function getSuggestion(req, res) {
  const { movement_id } = req.body;
  const officeId = getTenantOfficeId(req);

  if (!movement_id) {
    return res.status(400).json({ error: 'movement_id é obrigatório' });
  }

  try {
    let query = supabase
      .from('process_movements')
      .select('*')
      .eq('id', movement_id);

    if (!req.user?.is_master) {
      query = query.eq('office_id', officeId);
    }

    const { data: movement, error: fetchError } = await query.single();

    if (fetchError || !movement) return res.status(404).json({ error: 'Movimentação não encontrada' });

    const text = movement.movement_text || '';
    let classification = 'despacho';
    let priority = 'media';

    if (/audiência|audiencia|sessão|sessao/i.test(text)) {
      classification = 'audiencia';
      priority = 'alta';
    } else if (/sentença|sentenca|julgo|julga-se/i.test(text)) {
      classification = 'sentenca';
      priority = 'alta';
    } else if (/acórdão|acordao|turma recursal/i.test(text)) {
      classification = 'acordao';
      priority = 'alta';
    } else if (/penhora|bloqueio|sisbajud|renajud|execução/i.test(text)) {
      classification = 'despacho';
      priority = 'alta';
    } else if (/certidão|juntada|conclusos/i.test(text)) {
      classification = 'certidao';
      priority = 'baixa';
    }

    return res.status(200).json({
      suggested_classification: classification,
      suggested_priority: priority
    });
  } catch (error) {
    console.error('[TRIAGE] Erro ao obter sugestão:', error);
    return res.status(500).json({ error: 'Erro ao obter sugestão' });
  }
}
