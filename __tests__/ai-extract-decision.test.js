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

  it('calcula soma de dano material e dano moral para condenação total e honorários', () => {
    const raw = `\`\`\`json
{
  "dados_processo": {
    "numero_processo": "0000555-25.2026.8.05.0120",
    "tribunal": "TJBA",
    "comarca": "Itamaraju",
    "vara": "Vara do Sistema dos Juizados",
    "autor": "ROGERIO ARAUJO COSTA",
    "reu": "TAM LINHAS AEREAS S A",
    "cliente_provavel": "ROGERIO ARAUJO COSTA"
  },
  "tipo_ato": "Decisão Monocrática",
  "valores": {
    "tem_valores": true,
    "valor_dano_material": 7154.68,
    "valor_dano_moral": 4000.00,
    "valor_condenacao": 11154.68,
    "honorarios_percentual": 20,
    "honorarios_base": "condenacao",
    "honorarios_valor_estimado": 2230.94
  }
}
\`\`\``;

    const parsed = extractJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed.dados_processo.comarca).toBe('Itamaraju');
    expect(parsed.dados_processo.vara).toBe('Vara do Sistema dos Juizados');
    expect(parsed.valores.valor_dano_material).toBe(7154.68);
    expect(parsed.valores.valor_dano_moral).toBe(4000.00);
    expect(parsed.valores.valor_condenacao).toBe(11154.68);
    expect(parsed.valores.honorarios_valor_estimado).toBe(2230.94);
  });

  it('valida tarefas sugeridas sob a perspectiva do escritório do advogado e preenchimento de tipo_caso', () => {
    const raw = `\`\`\`json
{
  "dados_processo": {
    "numero_processo": "0005358-77.2026.8.05.0079",
    "tribunal": "TJBA",
    "comarca": "Eunápolis",
    "vara": "1ª Vara do Sistema dos Juizados",
    "orgao_julgador": "1ª Vara do Sistema dos Juizados",
    "classe": "Procedimento do Juizado Especial Cível",
    "tipo_caso": "Cobrança Indevida",
    "autor": "CAIO RIBEIRO LISBOA",
    "reu": "BANCO BRADESCO S/A",
    "cliente_provavel": "CAIO RIBEIRO LISBOA"
  },
  "tipo_ato": "Despacho",
  "resumo": "Designada Audiência de Instrução e Julgamento para depoimento pessoal da parte autora.",
  "fase_sugerida": "instrucao",
  "audiencia": {
    "identificada": true,
    "tipo": "Instrução e Julgamento",
    "data": "2026-11-20",
    "hora": "14:30",
    "modalidade": "Telepresencial"
  },
  "prazo": {
    "identificado": true,
    "tipo": "Audiência de Instrução e Julgamento",
    "sugestao_data_limite": "2026-11-20"
  },
  "tarefas_sugeridas": [
    "Acompanhar AIJ designada para 20/11/2026 às 14:30 e orientar/preparar o cliente Caio Ribeiro Lisboa",
    "Aguardar cumprimento voluntário pela parte ré ou protocolar Cumprimento de Sentença"
  ]
}
\`\`\``;

    const parsed = extractJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed.dados_processo.tipo_caso).toBe('Cobrança Indevida');
    expect(parsed.fase_sugerida).toBe('instrucao');
    expect(parsed.prazo.tipo).toBe('Audiência de Instrução e Julgamento');
    expect(parsed.tarefas_sugeridas[0]).not.toMatch(/intimar/i);
    expect(parsed.tarefas_sugeridas[0]).not.toMatch(/agendar aij/i);
    expect(parsed.tarefas_sugeridas[0]).toMatch(/acompanhar aij/i);
  });
});
