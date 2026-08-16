import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { queryDataJud } from '@/lib/datajudClient';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID do processo é obrigatório' });

  const profile = req.user;
  const start = Date.now();

  try {
    // Busca processo
    const { data: proc, error: procError } = await supabase
      .from('case_processes')
      .select('*')
      .eq('id', id)
      .single();

    if (procError || !proc) {
      return res.status(404).json({ error: 'Processo não encontrado' });
    }

    const result = await queryDataJud({
      processNumber: proc.process_number_normalized,
      tribunalCode: proc.court_code,
      timeoutMs: 25000
    });

    const duration = Date.now() - start;

    const log = {
      case_process_id: id,
      queried_by: profile.id,
      query_type: 'manual',
      status: result.status === 'success' ? 'success' : result.status,
      response_summary: result.status === 'success'
        ? {
            tribunal: result.court?.name,
            last_movement_date: result.lastMovement?.date,
            movements_count: result.movements?.length
          }
        : null,
      error_summary: result.error || null,
      duration_ms: duration
    };

    await supabase.from('process_query_logs').insert(log);

    if (['invalid', 'not_found', 'restricted', 'rate_limited', 'error'].includes(result.status)) {
      // Atualiza status interno e erro
      await supabase.from('case_processes').update({
        monitoring_status: result.status === 'restricted' ? 'sigiloso_restrito' : (result.status === 'not_found' ? 'processo_nao_localizado' : 'erro_de_consulta'),
        last_error: result.error,
        last_checked_at: new Date().toISOString()
      }).eq('id', id);

      return res.status(200).json({
        status: result.status,
        message: result.error,
        log
      });
    }

    // Detecta movimentações novas
    const existing = await supabase
      .from('process_movements')
      .select('external_movement_id, movement_text_normalized')
      .eq('case_process_id', id);

    const existingKeys = new Set((existing.data || []).map((m) => `${m.external_movement_id}::${m.movement_text_normalized}`));

    const newMovements = (result.movements || []).filter((m) => {
      const key = `${m.external_id}::${normalizeText(m.text)}`;
      return !existingKeys.has(key);
    });

    let insertedMovements = [];
    if (newMovements.length > 0) {
      const rows = newMovements.map((m) => ({
        case_process_id: id,
        external_movement_id: m.external_id,
        movement_date: m.date ? new Date(m.date).toISOString() : null,
        movement_text: m.text,
        movement_text_normalized: normalizeText(m.text),
        source: result.source,
        detected_at: new Date().toISOString(),
        review_status: 'nova'
      }));

      const { data: inserted, error: insertError } = await supabase
        .from('process_movements')
        .insert(rows)
        .select();

      if (!insertError) insertedMovements = inserted || [];
    }

    // Atualiza processo
    const lastMovement = result.lastMovement;
    const nextCheck = computeNextCheck(proc.monitoring_frequency);

    await supabase.from('case_processes').update({
      court_name: result.court?.name || proc.court_name,
      court_unit: result.court?.unit || proc.court_unit,
      instance: result.court?.instance || proc.instance,
      case_class: result.caseClass || proc.case_class,
      main_subject: result.mainSubject || proc.main_subject,
      last_checked_at: new Date().toISOString(),
      next_check_at: nextCheck,
      last_movement_at: lastMovement ? new Date(lastMovement.date).toISOString() : proc.last_movement_at,
      last_movement_summary: lastMovement ? lastMovement.text : proc.last_movement_summary,
      monitoring_status: 'ativo',
      last_error: null
    }).eq('id', id);

    await audit('QUERY', id, profile, { status: result.status, movements_inserted: insertedMovements.length });

    return res.status(200).json({
      status: result.status,
      data: result,
      new_movements_count: insertedMovements.length,
      new_movements: insertedMovements,
      log
    });
  } catch (error) {
    console.error('[CASE-PROCESSES/QUERY] Erro:', error);
    return res.status(500).json({ error: 'Erro interno na consulta' });
  }
}

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function computeNextCheck(frequency) {
  const now = new Date();
  if (frequency === 'diaria') now.setDate(now.getDate() + 1);
  else if (frequency === 'semanal') now.setDate(now.getDate() + 7);
  else if (frequency === 'quinzenal') now.setDate(now.getDate() + 15);
  else if (frequency === 'mensal') now.setMonth(now.getMonth() + 1);
  else return null;
  return now.toISOString();
}

async function audit(action, targetId, user, details = null) {
  try {
    await supabase.from('audit_logs').insert({
      action,
      table_name: 'case_processes',
      record_id: targetId,
      user_id: user.id,
      user_email: user.email,
      details
    });
  } catch (e) {
    console.error('[CASE-PROCESSES/QUERY] Falha ao auditar:', e);
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
