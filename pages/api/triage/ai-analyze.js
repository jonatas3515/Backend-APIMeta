import { withAuth } from '@/lib/auth';
import { askGeminiJson } from '@/lib/ai';

const URGENCIES = ['baixa', 'media', 'alta', 'urgente'];
const MAX_TEXT_LENGTH = 4000;

// Extrai JSON da resposta da IA, tolerando blocos ```json e texto ao redor
function extractJson(text) {
  if (!text) return null;
  const cleaned = String(text).trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : cleaned;
  try {
    return JSON.parse(candidate);
  } catch {
    // segue para extração por chaves
  }
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeAnalysis(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
  const suggested = typeof raw.suggested_action === 'string' ? raw.suggested_action.trim() : '';
  if (!summary && !suggested) return null;

  const days = Number(raw.deadline_days);
  return {
    summary: summary || null,
    deadline_days: Number.isFinite(days) && days > 0 ? Math.round(days) : null,
    suggested_action: suggested || null,
    urgency: URGENCIES.includes(raw.urgency) ? raw.urgency : 'media'
  };
}

function buildPrompt({ movement_text, case_title, court_code }) {
  const text = String(movement_text).slice(0, MAX_TEXT_LENGTH);
  return `Analise a movimentação processual abaixo e responda APENAS com um objeto JSON válido, sem markdown e sem texto adicional, exatamente neste formato:
{"summary": "<resumo objetivo em 1 ou 2 frases>", "deadline_days": <número de dias do prazo a partir de hoje, ou null>, "suggested_action": "<ação recomendada, ex: 'Petição de Réplica', 'Ciência sem prazo', 'Agendar Audiência'>", "urgency": "<'baixa'|'media'|'alta'|'urgente'>"}

Regras:
- deadline_days só deve ser preenchido se a movimentação indicar intimação, citação ou prazo judicial; caso contrário use null.
- urgency deve refletir o risco de perda de prazo ou prejuízo processual.
- Não invente datas, nomes de partes, números de processo ou fatos que não estejam no texto.

Caso: ${case_title || 'Não informado'}
Tribunal: ${court_code || 'Não informado'}
Movimentação: ${text}`;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { movement_id, movement_text, case_title, court_code } = req.body || {};

  if (!movement_text || !String(movement_text).trim()) {
    return res.status(400).json({ error: 'movement_text é obrigatório' });
  }

  try {
    const raw = await askGeminiJson(buildPrompt({ movement_text, case_title, court_code }));
    const analysis = normalizeAnalysis(extractJson(raw));

    if (!analysis) {
      console.warn('[AI-ANALYZE] Resposta da IA não continha JSON utilizável');
      return res.status(502).json({ error: 'Análise indisponível no momento' });
    }

    return res.status(200).json({
      success: true,
      movement_id: movement_id || null,
      analysis,
      disclaimer: 'Análise gerada por IA como apoio operacional — confirme no processo e no sistema oficial do tribunal antes de agir.'
    });
  } catch (error) {
    console.error('[AI-ANALYZE] Erro:', error?.message);
    return res.status(500).json({ error: 'Erro ao analisar movimentação' });
  }
}

export default withAuth(handler, { minRole: 'advogado' });
