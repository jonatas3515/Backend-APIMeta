import { createClient } from '@supabase/supabase-js';
import { withAuth, requireRole, hasMinimumRole } from '@/lib/auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

const ALLOWED_STATUS = [
  'rascunho', 'aguardando_aprovacao', 'aprovada', 'rejeitada',
  'expirada', 'substituida', 'convertida_em_proposta'
];

async function handler(req, res) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  try {
    const { method } = req;
    const { id, case_id, status } = req.query;
    const user = req.user;
    const isAdminOrLawyer = hasMinimumRole(user, 'advogado');

    if (method === 'GET') {
      let query = supabaseAdmin
        .from('fee_simulations')
        .select('*, fee_service_catalog(name, legal_area, case_type)');
      if (id) query = query.eq('id', id).single();
      if (case_id && case_id !== 'undefined' && case_id !== 'null') query = query.eq('case_id', case_id);
      if (status) query = query.eq('status', status);

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (method === 'POST') {
      if (req.body.action === 'calculate') {
        return calculate(req, res);
      }

      if (!req.body.case_id || req.body.case_id === 'undefined' || req.body.case_id === 'null') {
        return res.status(400).json({ error: 'case_id é obrigatório' });
      }

      const { simulation, calculated } = await buildSimulation(req, user);
      const { data, error } = await supabaseAdmin
        .from('fee_simulations')
        .insert(simulation)
        .select()
        .single();
      if (error) throw error;

      await logAudit(user.id, 'fee_simulations', data.id, 'create', null, { calculated, simulation: data });
      return res.status(201).json(data);
    }

    if (method === 'PATCH') {
      if (!id) return res.status(400).json({ error: 'ID obrigatório' });
      return updateSimulation(req, res, id, user, isAdminOrLawyer);
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (error) {
    console.error('[FEE-SIMULATIONS] Erro:', error);
    return res.status(500).json({ error: error.message || 'Erro interno' });
  }
}

async function calculate(req, res) {
  const { case_id, service_id, complexity, urgency, service_stage, document_volume, estimated_economic_value } = req.body;

  if (!service_id) return res.status(400).json({ error: 'Serviço obrigatório' });

  const { data: service, error: serviceError } = await supabaseAdmin
    .from('fee_service_catalog')
    .select('*')
    .eq('id', service_id)
    .eq('is_active', true)
    .single();

  if (serviceError || !service) {
    return res.status(404).json({ error: 'Serviço ativo não encontrado' });
  }

  const { data: rules } = await supabaseAdmin
    .from('fee_adjustment_rules')
    .select('*')
    .eq('service_id', service_id)
    .eq('is_active', true);

  const applied = [];
  let suggested = service.base_amount;

  const values = { complexity, urgency, service_stage, document_volume };
  for (const rule of rules || []) {
    const match = values[rule.rule_type] === rule.rule_value;
    if (!match) continue;

    let amount = 0;
    if (rule.adjustment_kind === 'percentual') {
      amount = service.base_amount * (rule.adjustment_value / 100);
    } else if (rule.adjustment_kind === 'valor_fixo') {
      amount = rule.adjustment_value;
    }

    suggested += amount;
    applied.push({
      rule_type: rule.rule_type,
      rule_value: rule.rule_value,
      adjustment_kind: rule.adjustment_kind,
      adjustment_value: rule.adjustment_value,
      amount: parseFloat(amount.toFixed(2))
    });
  }

  // percentual de êxito
  if (service.billing_model === 'percentual' && estimated_economic_value && service.success_fee_percent) {
    const success = estimated_economic_value * (service.success_fee_percent / 100);
    suggested = success;
    applied.push({
      rule_type: 'percentual_exito',
      rule_value: `${service.success_fee_percent}%`,
      adjustment_kind: 'valor_fixo',
      adjustment_value: parseFloat(success.toFixed(2)),
      amount: parseFloat(success.toFixed(2))
    });
  }

  suggested = Math.max(service.min_amount, Math.min(service.max_amount, suggested));

  const installments = service.default_installments || 1;
  const down = parseFloat((suggested * 0.3).toFixed(2)); // 30% entrada sugerida
  const remaining = parseFloat((suggested - down).toFixed(2));
  const installmentAmount = installments > 1 ? parseFloat((remaining / installments).toFixed(2)) : remaining;

  return res.status(200).json({
    service,
    applied_rules: applied,
    base_amount: service.base_amount,
    suggested_amount: parseFloat(suggested.toFixed(2)),
    min_amount: service.min_amount,
    max_amount: service.max_amount,
    billing_model: service.billing_model,
    success_fee_percent: service.success_fee_percent,
    down_payment: down,
    installments_count: installments,
    installment_amount: installmentAmount,
    estimated_economic_value
  });
}

async function buildSimulation(req, user) {
  const { case_id, service_id, complexity, urgency, service_stage, document_volume, estimated_economic_value, internal_notes } = req.body;

  const { data: service } = await supabaseAdmin
    .from('fee_service_catalog')
    .select('*')
    .eq('id', service_id)
    .eq('is_active', true)
    .single();

  if (!service) throw new Error('Serviço ativo não encontrado');

  const calc = await calculateForParams(supabaseAdmin, service, { complexity, urgency, service_stage, document_volume, estimated_economic_value });

  const simulation = {
    case_id,
    service_id,
    status: 'rascunho',
    complexity,
    urgency,
    service_stage,
    document_volume,
    estimated_economic_value,
    base_amount: calc.base_amount,
    adjustments_snapshot: calc.applied_rules,
    suggested_amount: calc.suggested_amount,
    min_amount_snapshot: calc.min_amount,
    max_amount_snapshot: calc.max_amount,
    final_amount: calc.suggested_amount,
    billing_model: calc.billing_model,
    down_payment: calc.down_payment,
    installments_count: calc.installments_count,
    installment_amount: calc.installment_amount,
    success_fee_percent: calc.success_fee_percent,
    internal_notes,
    created_by: user.id
  };

  return { simulation, calculated: calc };
}

async function calculateForParams(supabase, service, params) {
  const { complexity, urgency, service_stage, document_volume, estimated_economic_value } = params;

  const { data: rules } = await supabase
    .from('fee_adjustment_rules')
    .select('*')
    .eq('service_id', service.id)
    .eq('is_active', true);

  const applied = [];
  let suggested = service.base_amount;

  const values = { complexity, urgency, service_stage, document_volume };
  for (const rule of rules || []) {
    const match = values[rule.rule_type] === rule.rule_value;
    if (!match) continue;

    let amount = 0;
    if (rule.adjustment_kind === 'percentual') {
      amount = service.base_amount * (rule.adjustment_value / 100);
    } else if (rule.adjustment_kind === 'valor_fixo') {
      amount = rule.adjustment_value;
    }

    suggested += amount;
    applied.push({
      rule_type: rule.rule_type,
      rule_value: rule.rule_value,
      adjustment_kind: rule.adjustment_kind,
      adjustment_value: rule.adjustment_value,
      amount: parseFloat(amount.toFixed(2))
    });
  }

  if (service.billing_model === 'percentual' && estimated_economic_value && service.success_fee_percent) {
    const success = estimated_economic_value * (service.success_fee_percent / 100);
    suggested = success;
    applied.push({
      rule_type: 'percentual_exito',
      rule_value: `${service.success_fee_percent}%`,
      adjustment_kind: 'valor_fixo',
      adjustment_value: parseFloat(success.toFixed(2)),
      amount: parseFloat(success.toFixed(2))
    });
  }

  suggested = Math.max(service.min_amount, Math.min(service.max_amount, suggested));

  const installments = service.default_installments || 1;
  const down = parseFloat((suggested * 0.3).toFixed(2));
  const remaining = parseFloat((suggested - down).toFixed(2));
  const installmentAmount = installments > 1 ? parseFloat((remaining / installments).toFixed(2)) : remaining;

  return {
    base_amount: service.base_amount,
    applied_rules: applied,
    suggested_amount: parseFloat(suggested.toFixed(2)),
    min_amount: service.min_amount,
    max_amount: service.max_amount,
    billing_model: service.billing_model,
    success_fee_percent: service.success_fee_percent,
    down_payment: down,
    installments_count: installments,
    installment_amount: installmentAmount,
    estimated_economic_value
  };
}

async function updateSimulation(req, res, id, user, isAdminOrLawyer) {
  const { status, final_amount, out_of_range_justification, ...rest } = req.body;
  const { data: existing } = await supabaseAdmin.from('fee_simulations').select('*').eq('id', id).single();
  if (!existing) return res.status(404).json({ error: 'Simulação não encontrada' });

  const isOwner = existing.created_by === user.id;

  // Apenas admin/advogado pode aprovar/rejeitar/alterar valor final
  if ((final_amount !== undefined || status) && !isAdminOrLawyer && !isOwner) {
    return res.status(403).json({ error: 'Permissão insuficiente' });
  }

  const update = { ...rest };

  if (status) {
    if (!ALLOWED_STATUS.includes(status)) return res.status(400).json({ error: 'Status inválido' });

    if (status === 'aprovada' && !isAdminOrLawyer) {
      return res.status(403).json({ error: 'Apenas admin ou advogado pode aprovar' });
    }

    update.status = status;
    if (status === 'aprovada') {
      update.approved_by = user.id;
      update.approved_at = new Date().toISOString();
    }
    if (status === 'rejeitada') {
      update.rejected_by = user.id;
      update.rejected_at = new Date().toISOString();
    }
  }

  if (final_amount !== undefined) {
    const min = existing.min_amount_snapshot;
    const max = existing.max_amount_snapshot;
    const val = parseFloat(final_amount);
    if (val < min || val > max) {
      if (!out_of_range_justification || out_of_range_justification.trim().length < 10) {
        return res.status(400).json({ error: 'Valor fora da faixa exige justificativa com pelo menos 10 caracteres.' });
      }
      update.out_of_range_justification = out_of_range_justification;
    }
    update.final_amount = val;
  }

  const { data, error } = await supabaseAdmin
    .from('fee_simulations')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  await logAudit(user.id, 'fee_simulations', id, 'update', existing, data);
  return res.status(200).json(data);
}

async function logAudit(userId, entityType, entityId, action, oldValue, newValue) {
  await supabaseAdmin.from('audit_logs').insert({
    user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    old_value: oldValue ? JSON.stringify(oldValue) : null,
    new_value: newValue ? JSON.stringify(newValue) : null,
    created_at: new Date().toISOString()
  });
}

export default withAuth(handler, { minRole: 'estagiario' });
