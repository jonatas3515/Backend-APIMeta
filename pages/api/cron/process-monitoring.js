import { createClient } from '@supabase/supabase-js';
import { queryDataJud } from '@/lib/datajudClient';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

const BATCH_LIMIT = 20;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  // Cron é mantido desativado por padrão até validação manual do administrador.
  const CRON_ENABLED = process.env.DATAJUD_CRON_ENABLED === 'true';
  if (!CRON_ENABLED) {
    return res.status(403).json({
      error: 'Monitoramento programado desativado. Ative DATAJUD_CRON_ENABLED=true manualmente após testes.'
    });
  }

  try {
    const now = new Date().toISOString();
    const { data: processes, error } = await supabase
      .from('case_processes')
      .select('*')
      .eq('monitoring_status', 'ativo')
      .lt('next_check_at', now)
      .order('next_check_at', { ascending: true })
      .limit(BATCH_LIMIT);

    if (error) throw error;
    if (!processes || processes.length === 0) {
      return res.status(200).json({ processed: 0, results: [] });
    }

    const results = [];
    for (const proc of processes) {
      const start = Date.now();
      let result;
      try {
        result = await queryDataJud({
          processNumber: proc.process_number_normalized,
          tribunalCode: proc.court_code,
          timeoutMs: 25000
        });
      } catch (e) {
        result = { status: 'error', error: e.message };
      }
      const duration = Date.now() - start;

      await supabase.from('process_query_logs').insert({
        case_process_id: proc.id,
        queried_by: null,
        query_type: 'cron',
        status: result.status === 'success' ? 'success' : result.status,
        response_summary: result.status === 'success'
          ? { movements_count: result.movements?.length }
          : null,
        error_summary: result.error || null,
        duration_ms: duration
      });

      if (result.status === 'success') {
        const existing = await supabase
          .from('process_movements')
          .select('external_movement_id, movement_text_normalized')
          .eq('case_process_id', proc.id);

        const existingKeys = new Set((existing.data || []).map((m) => `${m.external_movement_id}::${m.movement_text_normalized}`));
        const newMovements = (result.movements || []).filter((m) => {
          const key = `${m.external_id}::${normalizeText(m.text)}`;
          return !existingKeys.has(key);
        });

        if (newMovements.length > 0) {
          const rows = newMovements.map((m) => ({
            case_process_id: proc.id,
            external_movement_id: m.external_id,
            movement_date: m.date ? new Date(m.date).toISOString() : null,
            movement_text: m.text,
            movement_text_normalized: normalizeText(m.text),
            source: result.source,
            detected_at: new Date().toISOString(),
            review_status: 'nova'
          }));

          await supabase.from('process_movements').insert(rows);
        }

        const lastMovement = result.lastMovement;
        const nextCheck = computeNextCheck(proc.monitoring_frequency);
        await supabase.from('case_processes').update({
          last_checked_at: new Date().toISOString(),
          next_check_at: nextCheck,
          last_movement_at: lastMovement ? new Date(lastMovement.date).toISOString() : proc.last_movement_at,
          last_movement_summary: lastMovement ? lastMovement.text : proc.last_movement_summary,
          monitoring_status: 'ativo',
          last_error: null
        }).eq('id', proc.id);
      } else {
        const statusMap = {
          restricted: 'sigiloso_restrito',
          not_found: 'processo_nao_localizado',
          rate_limited: 'erro_de_consulta',
          error: 'erro_de_consulta',
          invalid: 'erro_de_consulta'
        };
        await supabase.from('case_processes').update({
          monitoring_status: statusMap[result.status] || 'erro_de_consulta',
          last_error: result.error,
          last_checked_at: new Date().toISOString()
        }).eq('id', proc.id);
      }

      results.push({ process_id: proc.id, status: result.status });
    }

    return res.status(200).json({ processed: results.length, results });
  } catch (error) {
    console.error('[CRON/PROCESS-MONITORING] Erro:', error);
    return res.status(500).json({ error: 'Erro interno no cron' });
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
