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
  return `Você é um advogado especialista em processo civil, juizados especiais e direito bancário/consumidor no Brasil.
Analise o texto do ato judicial (despacho, decisão monocrática, sentença, acórdão ou certidão) abaixo e extraia com máxima precisão jurídica todas as informações processuais, valores e diligências.

Data de hoje para referência de cálculo de prazos: ${today}.
${caseContext ? `Contexto do Caso Atual: ${caseContext}` : ''}

Texto do Ato Judicial:
"""
${decisionText.slice(0, 6000)}
"""

Retorne ESTRITAMENTE um objeto JSON válido (sem markdown em volta, sem introdução e sem explicações), seguindo EXATAMENTE esta estrutura:
{
  "dados_processo": {
    "numero_processo": "<Número CNJ completo se encontrado, ex: 0000555-25.2026.8.05.0120 ou null>",
    "tribunal": "<TJBA | TJ | TRT | TRF | STJ | STF ou null>",
    "orgao_julgador": "<ex: 1ª Turma Recursal do Sistema dos Juizados ou null>",
    "classe": "<ex: Recurso Inominado | Apelação | Cumprimento de Sentença ou null>",
    "relator": "<Nome do magistrado(a) relator(a) se houver ou null>",
    "comarca": "<Nome da comarca ou município se identificado, ex: Itamaraju ou null>",
    "vara": "<Nome da vara ou juízo de origem se identificado, ex: Vara do Sistema dos Juizados ou null>",
    "cidade": "<Cidade de origem se identificada, ex: Itamaraju ou null>",
    "autor": "<Nome da parte autora / recorrida / exequente se identificado>",
    "reu": "<Nome da parte ré / recorrente / executada se identificado>",
    "advogado_autor": "<Nome do advogado da parte autora/recorrida se identificado>",
    "advogado_reu": "<Nome do advogado da parte ré/recorrente se identificado>",
    "cliente_provavel": "<Nome da parte cliente do escritório (ex: Rogerio Araujo Costa se o advogado for Jonatas do Nascimento Costa)>",
    "titulo_sugerido": "<Título do caso, ex: Cumprimento de Sentença — Rogerio Araujo Costa>",
    "area_juridica": "<consumidor | civel | trabalhista | previdenciario | bancario | outro>"
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
    "tipo": "<tipo de prazo, ex: Recurso Inominado, Apelação, Cumprimento de Sentença, Agravo Interno, Manifestação ou null>",
    "dias": null,
    "tipo_dias": "<úteis | corridos | null>",
    "sugestao_data_limite": "<AAAA-MM-DD estimada se calculável, ou null>"
  },
  "valores": {
    "tem_valores": false,
    "valor_dano_material": null,
    "valor_dano_moral": null,
    "outras_verbas": null,
    "valor_condenacao": null,
    "honorarios_percentual": null,
    "honorarios_base": "<condenacao | causa | fixo | null>",
    "honorarios_valor_estimado": null,
    "observacao_correcao_juros": "<Nota sobre incidência de juros e correção monetária>",
    "detalhes": "<ex: Ressarcimento de R$ 7.154,68 + Danos Morais de R$ 4.000,00 = Total de R$ 11.154,68. Honorários em 20% do valor da condenação>"
  },
  "tarefas_sugeridas": [
    "<diligência 1 a ser realizada>",
    "<diligência 2 a ser realizada>"
  ]
}

Regras Cruciais:
1. REGRA MANDATÓRIA DE CÁLCULO DA CONDENAÇÃO (SOMA TOTAL):
   - Se houver mais de uma verba deferida (ex: ressarcimento/dano material E danos morais), o campo 'valor_condenacao' DEVE SER A SOMA TOTAL de todas as verbas deferidas!
   - Exemplo concreto: Ressarcimento de R$ 7.154,68 + Danos Morais de R$ 4.000,00 (ou R$ 3.000,00) -> 'valor_condenacao' DEVE SER 11154.68 (7154.68 + 4000.00).
   - JAMAIS atribua ao 'valor_condenacao' apenas a parcela do ressarcimento ou dano material se houver dano moral também deferido.
   - Discrimine sempre 'valor_dano_material' e 'valor_dano_moral' nos seus respectivos campos.
2. HONORÁRIOS SUCUMBENCIAIS:
   - Se houver fixação de honorários (ex: "honorários em 20% do valor da condenação"), preencha "honorarios_percentual": 20 e "honorarios_base": "condenacao".
   - Calcule "honorarios_valor_estimado" aplicando o percentual sobre o valor TOTAL da condenação (ex: 20% de 11.154,68 = 2230.94).
   - Adicione na observação que o valor é aproximado antes da incidência de juros moratórios e correção monetária.
3. DADOS DE COMARCA, VARA E ÓRGÃO:
   - Se houver no texto "ORIGEM: Vara do Sistema dos Juizados - ITAMARAJU", extraia com precisão: comarca "Itamaraju", vara "Vara do Sistema dos Juizados", cidade "Itamaraju".
   - Extraia o Tribunal (ex: .8.05 = TJBA), Órgão (ex: 1ª Turma Recursal) e Relator(a).
4. FASE PROCESSUAL:
   - Se o recurso foi improvido/negado provimento e confirmada a condenação, a fase sugerida deve ser "execucao" (Cumprimento de Sentença).
5. Seja estrito: não invente datas ou valores ausentes no texto.`;
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

    // Normalização e proteção matemática de valores (Garantia de integridade)
    if (parsed.valores) {
      const mat = Number(parsed.valores.valor_dano_material) || 0;
      const mor = Number(parsed.valores.valor_dano_moral) || 0;
      const out = Number(parsed.valores.outras_verbas) || 0;
      let cond = Number(parsed.valores.valor_condenacao) || 0;

      // Se há dano material e moral identificados, garante que a condenação é a SOMA de ambos
      if (mat > 0 && mor > 0) {
        const somaTotal = Number((mat + mor + out).toFixed(2));
        if (!cond || Math.abs(cond - mat) < 0.01 || Math.abs(cond - mor) < 0.01) {
          cond = somaTotal;
          parsed.valores.valor_condenacao = somaTotal;
        }
      } else if (cond === 0 && (mat > 0 || mor > 0)) {
        cond = Number((mat + mor + out).toFixed(2));
        parsed.valores.valor_condenacao = cond;
      }

      if (cond > 0) {
        parsed.valores.tem_valores = true;
      }

      // Calcula honorários estimados sobre a condenação se houver percentual
      const pct = Number(parsed.valores.honorarios_percentual) || 0;
      if (pct > 0 && cond > 0 && parsed.valores.honorarios_base === 'condenacao') {
        parsed.valores.honorarios_valor_estimado = Number(((cond * pct) / 100).toFixed(2));
      }

      if (!parsed.valores.observacao_correcao_juros) {
        parsed.valores.observacao_correcao_juros = 'Valores aproximados sujeitos a atualização por juros e correção monetária na execução.';
      }
    }

    return res.status(200).json({ success: true, analysis: parsed });
  } catch (error) {
    safeError('ai_extract_decision_error', error, { route: '/api/cases/ai-extract-decision' });
    return res.status(500).json({ error: 'Erro ao processar despacho com IA. Tente novamente.' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
