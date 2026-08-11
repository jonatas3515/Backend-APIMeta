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

  const { method } = req;

  try {
    if (method === 'GET') {
      return handleGet(req, res);
    } else if (method === 'POST') {
      return handlePost(req, res);
    } else if (method === 'PATCH') {
      return handlePatch(req, res);
    } else if (method === 'DELETE') {
      return handleDelete(req, res);
    } else {
      return res.status(405).json({ error: 'Método não permitido' });
    }
  } catch (error) {
    console.error('[ROUTINES] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

async function handleGet(req, res) {
  const { id, legal_area, case_type, funnel_stage, action, conversation_id } = req.query;

  try {
    if (action === 'suggest') {
      // Sugere rotinas para uma conversa
      if (!conversation_id) {
        return res.status(400).json({ error: 'conversation_id é obrigatório' });
      }

      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('legal_area, case_type, funnel_stage')
        .eq('id', conversation_id)
        .single();

      if (convError || !conversation) {
        return res.status(404).json({ error: 'Conversa não encontrada' });
      }

      let query = supabase.from('legal_routines').select('*').eq('is_active', true);

      if (conversation.legal_area) {
        query = query.eq('legal_area', conversation.legal_area);
      }
      if (conversation.case_type) {
        query = query.eq('case_type', conversation.case_type);
      }
      if (conversation.funnel_stage) {
        query = query.eq('funnel_stage', conversation.funnel_stage);
      }

      const { data, error } = await query;

      if (error) throw error;

      return res.status(200).json(data || []);
    } else if (action === 'execute') {
      // Executa uma rotina para uma conversa
      const { routine_id, conversation_id: convId, case_id } = req.query;

      if (!routine_id || !convId) {
        return res.status(400).json({ error: 'routine_id e conversation_id são obrigatórios' });
      }

      // Busca rotina
      const { data: routine, error: routineError } = await supabase
        .from('legal_routines')
        .select('*')
        .eq('id', routine_id)
        .single();

      if (routineError || !routine) {
        return res.status(404).json({ error: 'Rotina não encontrada' });
      }

      // Cria registro de execução
      const { data: execution, error: execError } = await supabase
        .from('routine_executions')
        .insert({
          conversation_id: convId,
          case_id: case_id || null,
          routine_id,
          status: 'in_progress'
        })
        .select()
        .single();

      if (execError) throw execError;

      // Gera documentos
      const documentsGenerated = [];
      if (routine.documents_to_generate && routine.documents_to_generate.length > 0) {
        for (const templateId of routine.documents_to_generate) {
          try {
            const docRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/templates?action=generate&template_id=${templateId}&conversation_id=${convId}`, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' }
            });

            if (docRes.ok) {
              const doc = await docRes.json();
              documentsGenerated.push(doc.id);
            }
          } catch (err) {
            console.error('[ROUTINES] Erro ao gerar documento:', err);
          }
        }
      }

      // Cria lembretes
      const remindersCreated = [];
      if (routine.reminders_to_create && routine.reminders_to_create.length > 0) {
        for (const reminder of routine.reminders_to_create) {
          try {
            const scheduledFor = new Date();
            scheduledFor.setDate(scheduledFor.getDate() + (reminder.days_from_now || 0));

            const { data: reminderData, error: reminderError } = await supabase
              .from('chat_reminders')
              .insert({
                conversation_id: convId,
                type: reminder.type || 'routine',
                title: reminder.title,
                message: reminder.message,
                scheduled_for: scheduledFor.toISOString(),
                status: 'pending'
              })
              .select()
              .single();

            if (!reminderError && reminderData) {
              remindersCreated.push(reminderData.id);
            }
          } catch (err) {
            console.error('[ROUTINES] Erro ao criar lembrete:', err);
          }
        }
      }

      // Atualiza execução como concluída
      const { data: finalExecution, error: finalError } = await supabase
        .from('routine_executions')
        .update({
          status: 'completed',
          documents_generated: documentsGenerated,
          reminders_created: remindersCreated,
          executed_at: new Date().toISOString()
        })
        .eq('id', execution.id)
        .select()
        .single();

      if (finalError) throw finalError;

      return res.status(200).json({
        execution: finalExecution,
        documentsGenerated,
        remindersCreated
      });
    } else if (id) {
      // Retorna rotina específica
      const { data, error } = await supabase
        .from('legal_routines')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      return res.status(200).json(data);
    } else {
      // Lista rotinas com filtros
      let query = supabase.from('legal_routines').select('*').eq('is_active', true);

      if (legal_area) query = query.eq('legal_area', legal_area);
      if (case_type) query = query.eq('case_type', case_type);
      if (funnel_stage) query = query.eq('funnel_stage', funnel_stage);

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      return res.status(200).json(data || []);
    }
  } catch (error) {
    console.error('[ROUTINES] Erro ao buscar:', error);
    return res.status(500).json({ error: 'Erro ao buscar rotinas' });
  }
}

async function handlePost(req, res) {
  const {
    name,
    description,
    legal_area,
    case_type,
    funnel_stage,
    steps,
    documents_to_generate,
    reminders_to_create
  } = req.body;

  if (!name || !legal_area) {
    return res.status(400).json({ error: 'name e legal_area são obrigatórios' });
  }

  try {
    const { data, error } = await supabase
      .from('legal_routines')
      .insert({
        name,
        description: description || null,
        legal_area,
        case_type: case_type || null,
        funnel_stage: funnel_stage || null,
        steps: steps || [],
        documents_to_generate: documents_to_generate || [],
        reminders_to_create: reminders_to_create || [],
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[ROUTINES] Rotina criada: ${data.id}`);
    return res.status(201).json(data);
  } catch (error) {
    console.error('[ROUTINES] Erro ao criar rotina:', error);
    return res.status(500).json({ error: 'Erro ao criar rotina' });
  }
}

async function handlePatch(req, res) {
  const { id } = req.query;
  const updates = req.body;

  if (!id) {
    return res.status(400).json({ error: 'ID é obrigatório' });
  }

  try {
    const { data, error } = await supabase
      .from('legal_routines')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    console.log(`[ROUTINES] Rotina atualizada: ${id}`);
    return res.status(200).json(data);
  } catch (error) {
    console.error('[ROUTINES] Erro ao atualizar rotina:', error);
    return res.status(500).json({ error: 'Erro ao atualizar rotina' });
  }
}

async function handleDelete(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'ID é obrigatório' });
  }

  try {
    // Soft delete: marca como inativo
    const { error } = await supabase
      .from('legal_routines')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;

    console.log(`[ROUTINES] Rotina desativada: ${id}`);
    return res.status(200).json({ success: true, message: 'Rotina desativada' });
  } catch (error) {
    console.error('[ROUTINES] Erro ao deletar rotina:', error);
    return res.status(500).json({ error: 'Erro ao deletar rotina' });
  }
}
