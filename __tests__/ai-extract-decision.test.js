import { describe, it, expect, jest } from '@jest/globals';

// Test the extraction parser logic
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

describe('AI Extract Decision', () => {
  it('extrai corretamente JSON de decisão judicial estruturada', () => {
    const raw = `\`\`\`json
{
  "tipo_ato": "Decisão Monocrática",
  "resumo": "Recurso inominado da parte autora improvido, mantendo a sentença integralmente com 20% de honorários.",
  "resultado": "recurso_negado_provimento",
  "fase_sugerida": "execucao",
  "audiencia": {
    "identificada": false,
    "tipo": null,
    "data": null,
    "hora": null,
    "modalidade": null
  },
  "prazo": {
    "identificado": false,
    "tipo": null,
    "dias": null,
    "tipo_dias": null,
    "sugestao_data_limite": null
  },
  "valores": {
    "tem_valores": true,
    "valor_condenacao": null,
    "honorarios_percentual": 20,
    "honorarios_base": "condenacao",
    "detalhes": "Custas e honorários em 20% do valor da condenação a cargo do recorrente vencido"
  },
  "tarefas_sugeridas": [
    "Aguardar decurso de prazo para trânsito em julgado",
    "Iniciar cumprimento de sentença para recebimento dos 20% de honorários"
  ]
}
\`\`\``;

    const parsed = extractJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed.tipo_ato).toBe('Decisão Monocrática');
    expect(parsed.fase_sugerida).toBe('execucao');
    expect(parsed.valores.honorarios_percentual).toBe(20);
    expect(parsed.valores.honorarios_base).toBe('condenacao');
    expect(parsed.tarefas_sugeridas).toHaveLength(2);
  });
});
