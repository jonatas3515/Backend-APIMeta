import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

const FUNNEL_STAGES = [
  'lead_novo',
  'intake_em_andamento',
  'intake_concluido',
  'proposta_enviada',
  'contrato_assinado',
  'acao_protocolada',
  'aguardando_decisao',
  'encerrado'
];

async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const { method } = req;

  try {
    if (method === 'GET') {
      return handleGet(req, res);
    } else if (method === 'PATCH') {
      return handlePatch(req, res);
    } else {
      return res.status(405).json({ error: 'Método não permitido' });
    }
  } catch (error) {
    console.error('[FUNNEL] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });

async function handleGet(req, res) {
  const { action, conversation_id } = req.query;

  try {
    if (action === 'stages') {
      // Retorna contagem de conversas por etapa
      const { data, error } = await supabase
        .from('conversations')
        .select('funnel_stage, id')
        .in('funnel_stage', FUNNEL_STAGES);

      if (error) throw error;

      const stageCounts = {};
      FUNNEL_STAGES.forEach(stage => {
        stageCounts[stage] = data?.filter(c => c.funnel_stage === stage).length || 0;
      });

      return res.status(200).json({
        stages: FUNNEL_STAGES,
        counts: stageCounts,
        total: data?.length || 0
      });
    } else if (action === 'conversations') {
      // Retorna conversas de uma etapa específica
      const { stage } = req.query;

      if (!stage || !FUNNEL_STAGES.includes(stage)) {
        return res.status(400).json({ error: 'Stage inválido' });
      }

      const { data, error } = await supabase
        .from('conversations')
        .select('id, client_name, client_phone, funnel_stage, legal_area, case_type, status, mode, created_at, updated_at, has_case')
        .eq('funnel_stage', stage)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return res.status(200).json(data || []);
    } else if (action === 'metrics') {
      // Retorna métricas de funil
      const { data: metrics, error: metricsError } = await supabase
        .from('funnel_metrics')
        .select('*');

      if (metricsError) throw metricsError;

      const { data: conversions, error: convError } = await supabase
        .from('funnel_conversion_rates')
        .select('*');

      if (convError) throw convError;

      return res.status(200).json({
        metrics: metrics || [],
        conversions: conversions || []
      });
    } else if (action === 'history') {
      // Retorna histórico de mudanças de funil
      const limit = req.query.limit ? parseInt(req.query.limit) : 50;

      const { data, error } = await supabase
        .from('funnel_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return res.status(200).json(data || []);
    } else {
      // Retorna conversa específica com detalhes de funil
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversation_id)
        .single();

      if (error) throw error;

      return res.status(200).json(data);
    }
  } catch (error) {
    console.error('[FUNNEL] Erro ao buscar dados:', error);
    return res.status(500).json({ error: 'Erro ao buscar dados' });
  }
}

async function handlePatch(req, res) {
  const { conversation_id, new_stage, reason } = req.body;

  if (!conversation_id || !new_stage) {
    return res.status(400).json({ error: 'conversation_id e new_stage são obrigatórios' });
  }

  if (!FUNNEL_STAGES.includes(new_stage)) {
    return res.status(400).json({ error: `Stage inválido. Valores válidos: ${FUNNEL_STAGES.join(', ')}` });
  }

  try {
    // Busca conversa atual
    const { data: conversation, error: fetchError } = await supabase
      .from('conversations')
      .select('funnel_stage')
      .eq('id', conversation_id)
      .single();

    if (fetchError) throw fetchError;

    const oldStage = conversation.funnel_stage;

    // Atualiza stage
    const updateData = {
      funnel_stage: new_stage,
      funnel_stage_updated_at: new Date().toISOString()
    };

    // Define timestamps específicos baseado no novo stage
    if (new_stage === 'intake_em_andamento') {
      updateData.intake_started_at = new Date().toISOString();
    } else if (new_stage === 'intake_concluido') {
      updateData.intake_completed_at = new Date().toISOString();
    } else if (new_stage === 'proposta_enviada') {
      updateData.proposal_sent_at = new Date().toISOString();
    } else if (new_stage === 'contrato_assinado') {
      updateData.contract_signed_at = new Date().toISOString();
    } else if (new_stage === 'acao_protocolada') {
      updateData.action_filed_at = new Date().toISOString();
    } else if (new_stage === 'encerrado') {
      updateData.case_closed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('conversations')
      .update(updateData)
      .eq('id', conversation_id)
      .select()
      .single();

    if (error) throw error;

    // Log da mudança (trigger automático registra em funnel_history)
    console.log(`[FUNNEL] Conversa ${conversation_id}: ${oldStage} → ${new_stage} (${reason || 'sem motivo'})`);

    return res.status(200).json({
      success: true,
      conversation: data,
      message: `Conversa movida de ${oldStage} para ${new_stage}`
    });
  } catch (error) {
    console.error('[FUNNEL] Erro ao atualizar stage:', error);
    return res.status(500).json({ error: 'Erro ao atualizar stage' });
  }
}
