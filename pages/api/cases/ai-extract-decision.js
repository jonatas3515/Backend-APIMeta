import { withAuth } from '@/lib/auth';
import { askGeminiJson } from '@/lib/ai';
import { safeError } from '@/lib/safeLogger';

function extractJson(text) {
  if (!text) return null;
  const cleaned = String(text).trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : cleaned;
  try {
    return JSON.parse(candidate);
  } catch {}
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function buildPrompt(decisionText, caseContext = '') {
  const today = new Date().toISOString().slice(0, 10);
  return `Você é um advogado especialista em processo civil, trabalhista e juizados especiais no Brasil.
Analise o texto do ato judicial (despacho, decisão monocrática, sentença, acórdão ou certidão) abaixo e extraia com máxima precisão jurídica as seguintes informações.

Data de hoje para referência de cálculo de prazos: ${today}.
${caseContext ? `Contexto do Caso Atual: ${caseContext}` : ''}

Texto do Ato Judicial:
"""
${decisionText.slice(0, 6000)}
"""

Retorne ESTRITAMENTE um objeto JSON válido (sem markdown em volta, sem introdução e sem explicações), seguindo EXATAMENTE esta estrutura:
{
  "dados_processo": {
    "numero_processo": "<Número CNJ completo se encontrado, ex: 0001620-89.2025.8.05.0120 ou null>",
    "tribunal": "<TJ | TRT | TRF | STJ | STF ou null>",
    "comarca": "<Nome da comarca ou município se identificado, ex: Itamaraju ou null>",
    "vara": "<Nome da vara ou juízo de origem se identificado, ex: Vara do Sistema dos Juizados ou null>",
    "autor": "<Nome da parte autora / exequente / recorrida se identificado>",
    "reu": "<Nome da parte ré / executada / recorrente se identificado>",
    "cliente_provavel": "<Nome da parte que é o cliente (normalmente a pessoa física ou recorrida/exequente)>",
    "titulo_sugerido": "<Título do caso, ex: Cumprimento de Sentença — Beatriz Soares Andrade>",
    "area_juridica": "<civel | trabalhista | consumidor | previdenciario | outro>"
  },
  "tipo_ato": "<Decisão Monocrática | Sentença | Despacho | Acórdão | Certidão | Audiência Designada | Intimação>",
  "resumo": "<Resumo claro e objetivo em 1 a 3 frases do que foi decidido>",
  "resultado": "<recurso_negado_provimento | recurso_provido | procedencia | procedencia_parcial | improcedencia | acordo_homologado | intimacao_prazo | audiencia_marcada | mero_expediente>",
  "fase_sugerida": "<conciliacao | instrucao | sentenca | recurso | execucao | acordo>",
  "audiencia": {
    "identificada": false,
    "tipo": "<Conciliação | Instrução e Julgamento | Una | null>",
    "data": "<AAAA-MM-DD ou null se não houver>",
    "hora": "<HH:MM ou null>",
    "modalidade": "<Presencial | Telepresencial / Virtual | null>"
  },
  "prazo": {
    "identificado": false,
    "tipo": "<tipo de prazo, ex: Recurso Inominado, Apelação, Cumprimento de Sentença, Contestação, Manifestação ou null>",
    "dias": null,
    "tipo_dias": "<úteis | corridos | null>",
    "sugestao_data_limite": "<AAAA-MM-DD estimada se calculável, ou null>"
  },
  "valores": {
    "tem_valores": false,
    "valor_condenacao": null,
    "valor_dano_moral": null,
    "valor_dano_material": null,
    "honorarios_percentual": null,
    "honorarios_base": "<condenacao | causa | fixo | null>",
    "honorarios_valor_estimado": null,
    "detalhes": "<ex: Honorários fixados em 20% sobre o valor da condenação>"
  },
  "tarefas_sugeridas": [
    "<diligência 1 a ser realizada>",
    "<diligência 2 a ser realizada>"
  ]
}

Regras Cruciais:
1. Extraia o número do processo CNJ e dados das partes (autor/réu) com máxima fidelidade.
2. Se houver condenação expressa em valor ou honorários (ex: "honorários em 20% do valor da condenação"), preencha "honorarios_percentual": 20 e "honorarios_base": "condenacao". Se houver o valor numérico da condenação no texto, calcule "honorarios_valor_estimado".
3. Se o recurso foi improvido/negado provimento e mantida a sentença condenatória ou execução, a fase sugerida deve ser "execucao" (cumprimento de sentença).
4. Seja estrito: não invente datas ou valores ausentes no texto.`;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { text, caseContext } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Texto da decisão ou despacho é obrigatório.' });
  }

  try {
    const prompt = buildPrompt(text.trim(), caseContext);
    const rawAiResponse = await askGeminiJson(prompt);
    const parsed = extractJson(rawAiResponse);

    if (!parsed) {
      return res.status(502).json({
        error: 'Não foi possível estruturar a resposta da IA.',
        raw: rawAiResponse
      });
    }

    return res.status(200).json({ success: true, analysis: parsed });
  } catch (error) {
    safeError('ai_extract_decision_error', error, { route: '/api/cases/ai-extract-decision' });
    return res.status(500).json({ error: 'Erro ao processar despacho com IA. Tente novamente.' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
