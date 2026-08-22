import { createClient } from '@supabase/supabase-js';
import { generateInsightWithAI } from '@/lib/ai-insights';
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
    } else if (method === 'DELETE') {
      return handleDelete(req, res);
    } else {
      return res.status(405).json({ error: 'Método não permitido' });
    }
  } catch (error) {
    console.error('[INSIGHTS] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });

async function handleGet(req, res) {
  const { action, id, conversation_id, case_id, legal_area, case_type, municipality, agency, search, limit = 50 } = req.query;

  try {
    if (action === 'generate_proposal') {
      // Gera proposta de insight usando IA
      if (!conversation_id) {
        return res.status(400).json({ error: 'conversation_id é obrigatório' });
      }

      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversation_id)
        .single();

      if (convError || !conversation) {
        return res.status(404).json({ error: 'Conversa não encontrada' });
      }

      // Busca case_summary, intake_data, media_summary
      const proposal = await generateInsightWithAI(conversation);

      return res.status(200).json(proposal);
    } else if (action === 'similar') {
      // Busca insights similares
      if (!conversation_id) {
        return res.status(400).json({ error: 'conversation_id é obrigatório' });
      }

      const { data: conversation } = await supabase
        .from('conversations')
        .select('legal_area, case_type, municipality, agency, client_role')
        .eq('id', conversation_id)
        .single();

      if (!conversation) {
        return res.status(200).json([]);
      }

      const { data, error } = await supabase.rpc('find_similar_insights', {
        p_legal_area: conversation.legal_area,
        p_case_type: conversation.case_type,
        p_municipality: conversation.municipality,
        p_agency: conversation.agency,
        p_client_role: conversation.client_role,
        p_limit: 5
      });

      if (error) throw error;

      return res.status(200).json(data || []);
    } else if (id) {
      // Retorna insight específico
      const { data, error } = await supabase
        .from('case_insights')
        .select(`
          *,
          users(name, email),
          conversations(client_name, client_phone),
          cases(title, status)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      // Registra visualização
      await supabase.from('insight_usage').insert({
        insight_id: id,
        action: 'view'
      });

      return res.status(200).json(data);
    } else {
      // Lista insights com filtros
      let query = supabase.from('case_insights').select(`
        id, legal_area, case_type, municipality, agency, client_role,
        summary, created_at, created_by_user_id,
        users(name), conversations(client_name)
      `);

      if (case_id) query = query.eq('case_id', case_id);
      if (legal_area) query = query.eq('legal_area', legal_area);
      if (case_type) query = query.eq('case_type', case_type);
      if (municipality) query = query.eq('municipality', municipality);
      if (agency) query = query.eq('agency', agency);

      if (search) {
        query = query.or(`summary.ilike.%${search}%,strategy_notes.ilike.%${search}%,risk_notes.ilike.%${search}%,outcome_notes.ilike.%${search}%`);
      }

      query = query.eq('confidential', false).order('created_at', { ascending: false }).limit(parseInt(limit));

      const { data, error } = await query;

      if (error) throw error;

      return res.status(200).json(data || []);
    }
  } catch (error) {
    console.error('[INSIGHTS] Erro ao buscar:', error);
    return res.status(500).json({ error: 'Erro ao buscar insights' });
  }
}

async function handlePost(req, res) {
  const { action } = req.body;

  try {
    if (action === 'create') {
      const {
        case_id,
        conversation_id,
        legal_area,
        case_type,
        municipality,
        agency,
        client_role,
        summary,
        strategy_notes,
        risk_notes,
        outcome_notes,
        similar_patterns,
        created_by_user_id,
        source = 'manual',
        confidential = false,
        confidential_reason
      } = req.body;

      if (!conversation_id) {
        return res.status(400).json({ error: 'conversation_id é obrigatório' });
      }

      const { data, error } = await supabase
        .from('case_insights')
        .insert({
          case_id: case_id || null,
          conversation_id,
          legal_area,
          case_type,
          municipality,
          agency,
          client_role,
          summary,
          strategy_notes,
          risk_notes,
          outcome_notes,
          similar_patterns,
          created_by_user_id: created_by_user_id || null,
          source,
          confidential,
          confidential_reason: confidential_reason || null
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`[INSIGHTS] Insight criado: ${data.id}`);
      return res.status(201).json(data);
    }
  } catch (error) {
    console.error('[INSIGHTS] Erro ao criar:', error);
    return res.status(500).json({ error: 'Erro ao criar insight' });
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
      .from('case_insights')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    console.log(`[INSIGHTS] Insight atualizado: ${id}`);
    return res.status(200).json(data);
  } catch (error) {
    console.error('[INSIGHTS] Erro ao atualizar:', error);
    return res.status(500).json({ error: 'Erro ao atualizar insight' });
  }
}

async function handleDelete(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'ID é obrigatório' });
  }

  try {
    const { error } = await supabase
      .from('case_insights')
      .delete()
      .eq('id', id);

    if (error) throw error;

    console.log(`[INSIGHTS] Insight deletado: ${id}`);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[INSIGHTS] Erro ao deletar:', error);
    return res.status(500).json({ error: 'Erro ao deletar insight' });
  }
}
